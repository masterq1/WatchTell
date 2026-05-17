"""
Single-stack WatchTell deployment.

Provisions all AWS resources in one stack: EC2 Spot worker, SQS, DynamoDB,
S3 (media + SPA), Step Functions pipeline, API Gateway, Cognito, and a
CloudFront distribution that serves the React SPA.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import aws_cdk as cdk
import jsii
from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_authorizers as authorizers,
    aws_apigatewayv2_integrations as integrations,
    aws_autoscaling as autoscaling,
    aws_cognito as cognito,
    aws_dynamodb as dynamodb,
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_lambda_event_sources as event_sources,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3 as s3,
    aws_s3_assets as s3_assets,
    aws_s3_deployment as s3_deploy,
    aws_sns as sns,
    aws_sqs as sqs,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    custom_resources as cr,
)
from constructs import Construct

LAMBDA_RUNTIME = lambda_.Runtime.PYTHON_3_12
LAMBDA_TIMEOUT = Duration.seconds(30)

ROOT_DIR = Path(__file__).resolve().parents[2]
API_DIR = ROOT_DIR / "api"
WORKER_DIR = ROOT_DIR / "worker"


def _latest_owned_worker_ami(region: str) -> str:
    """Return the newest owned WatchTell worker AMI, if boto3 lookup is possible."""
    if os.environ.get("WATCHTELL_SKIP_AMI_LOOKUP"):
        return ""
    try:
        import boto3

        ec2_client = boto3.client("ec2", region_name=region)
        resp = ec2_client.describe_images(
            Owners=["self"],
            Filters=[
                {"Name": "tag:WatchTellWorker", "Values": ["true"]},
                {"Name": "state", "Values": ["available"]},
            ],
        )
    except Exception:
        return ""

    images = sorted(resp.get("Images", []), key=lambda img: img.get("CreationDate", ""), reverse=True)
    return images[0]["ImageId"] if images else ""


@jsii.implements(cdk.ILocalBundling)
class _LocalPipBundler:
    """Bundle Lambda code and dependencies without Docker when local pip exists."""

    def try_bundle(self, output_dir: str, _options=None, /, **_kwargs) -> bool:
        subprocess.run(
            ["pip", "install", "-r", "requirements.txt", "-t", output_dir, "--quiet"],
            cwd=API_DIR,
            check=True,
        )
        for item in API_DIR.iterdir():
            src = item
            dst = Path(output_dir) / item.name
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        return True


class SingleStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        cdk.Tags.of(self).add("Project", "WatchTell")

        camera_id_param = cdk.CfnParameter(
            self,
            "CameraId",
            type="String",
            default="cam-doorway",
            description="Logical camera ID used in S3 keys and event records.",
        )
        rtsp_url_param = cdk.CfnParameter(
            self,
            "CameraRtspUrl",
            type="String",
            default="rtsp://23.125.22.17:4032/Doorway1_Main_rtsp",
            description="Single RTSP camera URL consumed by the EC2 relay.",
            no_echo=True,
        )
        hls_url_param = cdk.CfnParameter(
            self,
            "CameraHlsUrl",
            type="String",
            default="https://go2rtc.ronscrib.com/api/stream.m3u8?src=Doorway1_Main&mp4",
            description="Browser-playable HLS URL for the camera.",
        )
        searchquarry_api_key_param = cdk.CfnParameter(
            self,
            "SearchQuarryApiKey",
            type="String",
            default="disabled",
            description="Optional SearchQuarry API key. Use disabled to skip plate validation.",
            no_echo=True,
        )
        upstash_url_param = cdk.CfnParameter(
            self,
            "UpstashRedisUrl",
            type="String",
            default="disabled",
            description="Optional Upstash Redis URL for plate-validation caching.",
            no_echo=True,
        )
        upstash_token_param = cdk.CfnParameter(
            self,
            "UpstashRedisToken",
            type="String",
            default="disabled",
            description="Optional Upstash Redis token for plate-validation caching.",
            no_echo=True,
        )

        media_bucket = s3.Bucket(
            self,
            "MediaBucket",
            intelligent_tiering_configurations=[
                s3.IntelligentTieringConfiguration(
                    name="DefaultTiering",
                    archive_access_tier_time=Duration.days(90),
                    deep_archive_access_tier_time=Duration.days(180),
                )
            ],
            lifecycle_rules=[
                s3.LifecycleRule(id="Expire365Days", enabled=True, expiration=Duration.days(365)),
            ],
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.RETAIN,
        )

        events_table = dynamodb.Table(
            self,
            "EventsTable",
            partition_key=dynamodb.Attribute(name="EventId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="Timestamp", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        events_table.add_global_secondary_index(
            index_name="PlateNumber-Timestamp-index",
            partition_key=dynamodb.Attribute(name="PlateNumber", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="Timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        events_table.add_global_secondary_index(
            index_name="CameraId-Timestamp-index",
            partition_key=dynamodb.Attribute(name="CameraId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="Timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        events_table.add_global_secondary_index(
            index_name="EventType-Timestamp-index",
            partition_key=dynamodb.Attribute(name="EventType", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="Timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        watchlist_table = dynamodb.Table(
            self,
            "WatchlistTable",
            partition_key=dynamodb.Attribute(name="PlateNumber", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        dlq = sqs.Queue(
            self,
            "AlprDlq",
            retention_period=Duration.days(14),
        )
        alpr_queue = sqs.Queue(
            self,
            "AlprQueue",
            visibility_timeout=Duration.seconds(90),
            retention_period=Duration.days(4),
            dead_letter_queue=sqs.DeadLetterQueue(max_receive_count=3, queue=dlq),
        )
        results_queue = sqs.Queue(
            self,
            "AlprResultsQueue",
            visibility_timeout=Duration.seconds(30),
            retention_period=Duration.days(1),
        )

        self._settings_writers = self._parameters(
            camera_id=camera_id_param.value_as_string,
            rtsp_url=rtsp_url_param.value_as_string,
            hls_url=hls_url_param.value_as_string,
            searchquarry_api_key=searchquarry_api_key_param.value_as_string,
            upstash_url=upstash_url_param.value_as_string,
            upstash_token=upstash_token_param.value_as_string,
            media_bucket_name=media_bucket.bucket_name,
            alpr_queue_url=alpr_queue.queue_url,
            results_queue_url=results_queue.queue_url,
            events_table_name=events_table.table_name,
            watchlist_table_name=watchlist_table.table_name,
        )

        alerts_topic = sns.Topic(
            self,
            "AlertsTopic",
            display_name="WatchTell Alerts",
        )
        state_machine = self._pipeline(
            events_table=events_table,
            watchlist_table=watchlist_table,
            media_bucket=media_bucket,
            results_queue=results_queue,
            alerts_topic=alerts_topic,
        )
        api, user_pool, user_pool_client = self._api(
            events_table=events_table,
            watchlist_table=watchlist_table,
            media_bucket=media_bucket,
            pipeline_arn=state_machine.state_machine_arn,
        )
        self._worker(
            media_bucket=media_bucket,
            alpr_queue=alpr_queue,
            results_queue=results_queue,
            events_table=events_table,
            watchlist_table=watchlist_table,
            worker_asset=s3_assets.Asset(self, "WorkerAsset", path=str(WORKER_DIR)),
        )

        spa_url = self._spa(api_url=api.api_endpoint, user_pool=user_pool, user_pool_client=user_pool_client)

        CfnOutput(self, "ApiUrl", value=api.api_endpoint)
        CfnOutput(self, "UserPoolId", value=user_pool.user_pool_id)
        CfnOutput(self, "UserPoolClientId", value=user_pool_client.user_pool_client_id)
        CfnOutput(self, "MediaBucketName", value=media_bucket.bucket_name)
        CfnOutput(self, "AlprQueueUrl", value=alpr_queue.queue_url)
        CfnOutput(self, "ResultsQueueUrl", value=results_queue.queue_url)
        CfnOutput(self, "CameraHlsParameter", value="/watchtell/camera/hls")
        CfnOutput(self, "DashboardUrl", value=spa_url)

    def _parameters(
        self,
        camera_id: str,
        rtsp_url: str,
        hls_url: str,
        searchquarry_api_key: str,
        upstash_url: str,
        upstash_token: str,
        media_bucket_name: str,
        alpr_queue_url: str,
        results_queue_url: str,
        events_table_name: str,
        watchlist_table_name: str,
    ) -> list[cr.AwsCustomResource]:
        values = {
            "/watchtell/camera/id": camera_id,
            "/watchtell/camera/rtsp_url": rtsp_url,
            "/watchtell/camera/hls": hls_url,
            # Backward-compatible names consumed by worker/install.sh.
            "/watchtell/relay/camera_id": camera_id,
            "/watchtell/relay/rtsp_url": rtsp_url,
            "/watchtell/searchquarry/api_key": searchquarry_api_key,
            "/watchtell/upstash/url": upstash_url,
            "/watchtell/upstash/token": upstash_token,
            "/watchtell/runtime/media_bucket": media_bucket_name,
            "/watchtell/runtime/alpr_queue_url": alpr_queue_url,
            "/watchtell/runtime/results_queue_url": results_queue_url,
            "/watchtell/runtime/events_table": events_table_name,
            "/watchtell/runtime/watchlist_table": watchlist_table_name,
        }
        writers = []
        for idx, (name, value) in enumerate(values.items()):
            writers.append(cr.AwsCustomResource(
                self,
                f"ParamWriter{idx}",
                on_create=cr.AwsSdkCall(
                    service="SSM",
                    action="putParameter",
                    parameters={
                        "Name": name,
                        "Value": value,
                        "Type": "String",
                        "Overwrite": True,
                    },
                    physical_resource_id=cr.PhysicalResourceId.of(name),
                ),
                on_update=cr.AwsSdkCall(
                    service="SSM",
                    action="putParameter",
                    parameters={
                        "Name": name,
                        "Value": value,
                        "Type": "String",
                        "Overwrite": True,
                    },
                    physical_resource_id=cr.PhysicalResourceId.of(name),
                ),
                policy=cr.AwsCustomResourcePolicy.from_sdk_calls(
                    resources=cr.AwsCustomResourcePolicy.ANY_RESOURCE,
                ),
            ))
        return writers

    def _lambda(self, name: str, handler: str, env: dict, function_name: str | None = None) -> lambda_.Function:
        return lambda_.Function(
            self,
            name,
            function_name=function_name,
            runtime=LAMBDA_RUNTIME,
            handler=handler,
            code=lambda_.Code.from_asset(
                str(API_DIR),
                bundling=cdk.BundlingOptions(
                    image=LAMBDA_RUNTIME.bundling_image,
                    command=[
                        "bash",
                        "-c",
                        "pip install -r requirements.txt -t /asset-output --quiet"
                        " && cp -r . /asset-output",
                    ],
                    local=_LocalPipBundler(),
                ),
            ),
            timeout=LAMBDA_TIMEOUT,
            environment=env,
            memory_size=256,
        )

    def _pipeline(
        self,
        events_table: dynamodb.Table,
        watchlist_table: dynamodb.Table,
        media_bucket: s3.Bucket,
        results_queue: sqs.Queue,
        alerts_topic: sns.Topic,
    ) -> sfn.StateMachine:
        shared_env = {
            "EVENTS_TABLE": events_table.table_name,
            "WATCHLIST_TABLE": watchlist_table.table_name,
            "MEDIA_BUCKET": media_bucket.bucket_name,
            "ALERTS_TOPIC_ARN": alerts_topic.topic_arn,
        }

        normalize_plate_fn = self._lambda(
            "NormalizePlateReading", "pipeline/parse_result.handler", shared_env,
            function_name="watchtell-normalize-plate-reading",
        )
        lookup_registration_fn = self._lambda(
            "LookUpPlateRegistration",
            "pipeline/validate_plate.handler",
            {
                **shared_env,
                "UPSTASH_REDIS_URL": "{{resolve:ssm:/watchtell/upstash/url}}",
                "UPSTASH_REDIS_TOKEN": "{{resolve:ssm:/watchtell/upstash/token}}",
                "SEARCHQUARRY_API_KEY": "{{resolve:ssm:/watchtell/searchquarry/api_key}}",
            },
            function_name="watchtell-lookup-plate-registration",
        )
        for writer in self._settings_writers:
            lookup_registration_fn.node.add_dependency(writer)
        record_detection_fn = self._lambda(
            "RecordDetectionEvent", "pipeline/store_event.handler", shared_env,
            function_name="watchtell-record-detection-event",
        )
        screen_against_watchlist_fn = self._lambda(
            "ScreenAgainstWatchlist", "pipeline/check_watchlist.handler", shared_env,
            function_name="watchtell-screen-against-watchlist",
        )
        alpr_result_router_fn = self._lambda(
            "AlprResultRouter", "pipeline/sqs_trigger.handler", shared_env,
            function_name="watchtell-alpr-result-router",
        )

        events_table.grant_read_write_data(record_detection_fn)
        events_table.grant_read_write_data(alpr_result_router_fn)
        watchlist_table.grant_read_data(screen_against_watchlist_fn)
        watchlist_table.grant_read_data(alpr_result_router_fn)
        media_bucket.grant_read_write(normalize_plate_fn)
        alerts_topic.grant_publish(screen_against_watchlist_fn)

        definition = (
            tasks.LambdaInvoke(self, "NormalizePlateReadingStep", lambda_function=normalize_plate_fn, output_path="$.Payload")
            .next(tasks.LambdaInvoke(self, "LookUpPlateRegistrationStep", lambda_function=lookup_registration_fn, output_path="$.Payload"))
            .next(tasks.LambdaInvoke(self, "RecordDetectionEventStep", lambda_function=record_detection_fn, output_path="$.Payload"))
            .next(tasks.LambdaInvoke(self, "ScreenAgainstWatchlistStep", lambda_function=screen_against_watchlist_fn, output_path="$.Payload"))
        )
        state_machine = sfn.StateMachine(
            self,
            "AlprDetectionPipeline",
            state_machine_name="watchtell-alpr-detection-pipeline",
            definition_body=sfn.DefinitionBody.from_chainable(definition),
            timeout=Duration.minutes(5),
        )

        state_machine.grant_start_execution(alpr_result_router_fn)
        alpr_result_router_fn.add_environment("STATE_MACHINE_ARN", state_machine.state_machine_arn)
        results_queue.grant_consume_messages(alpr_result_router_fn)
        alpr_result_router_fn.add_event_source(
            event_sources.SqsEventSource(
                results_queue,
                batch_size=1,
                max_batching_window=Duration.seconds(0),
            )
        )
        return state_machine

    def _api(
        self,
        events_table: dynamodb.Table,
        watchlist_table: dynamodb.Table,
        media_bucket: s3.Bucket,
        pipeline_arn: str,
    ) -> tuple[apigwv2.HttpApi, cognito.UserPool, cognito.UserPoolClient]:
        # Use the shared watchtell-users pool rather than creating a stack-owned one.
        user_pool = cognito.UserPool.from_user_pool_id(
            self, "UserPool", "us-east-1_2noObkW1l"
        )
        user_pool_client = cognito.UserPoolClient.from_user_pool_client_id(
            self, "UserPoolClient", "7s0l5mq0q5ak7ipe66vughdni0"
        )

        shared_env = {
            "EVENTS_TABLE": events_table.table_name,
            "WATCHLIST_TABLE": watchlist_table.table_name,
            "MEDIA_BUCKET": media_bucket.bucket_name,
            "USER_POOL_ID": user_pool.user_pool_id,
            "USER_POOL_CLIENT_ID": user_pool_client.user_pool_client_id,
            "PIPELINE_ARN": pipeline_arn,
        }
        events_fn = self._lambda("ApiEvents", "events.handler", shared_env)
        plates_fn = self._lambda("ApiPlates", "plates.handler", shared_env)
        watchlist_fn = self._lambda("ApiWatchlist", "watchlist.handler", shared_env)
        search_fn = self._lambda("ApiSearch", "search.handler", shared_env)
        clips_fn = self._lambda("ApiClips", "clips.handler", shared_env)

        events_table.grant_read_data(events_fn)
        events_table.grant_read_data(search_fn)
        watchlist_table.grant_read_write_data(watchlist_fn)
        events_table.grant_read_data(plates_fn)
        media_bucket.grant_read(clips_fn)

        http_api = apigwv2.HttpApi(
            self,
            "HttpApi",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_origins=["*"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=["Authorization", "Content-Type"],
            ),
        )
        jwt_authorizer = authorizers.HttpJwtAuthorizer(
            "CognitoAuthorizer",
            jwt_issuer=f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}",
            jwt_audience=[user_pool_client.user_pool_client_id],
        )

        def route(integration_id: str, method: apigwv2.HttpMethod, path: str, fn: lambda_.Function) -> None:
            http_api.add_routes(
                path=path,
                methods=[method],
                integration=integrations.HttpLambdaIntegration(integration_id, fn),
                authorizer=jwt_authorizer,
            )

        route("IntEventsGet", apigwv2.HttpMethod.GET, "/events", events_fn)
        route("IntEventsById", apigwv2.HttpMethod.GET, "/events/{id}", events_fn)
        route("IntPlates", apigwv2.HttpMethod.GET, "/plates/{plate}", plates_fn)
        route("IntWatchlistGet", apigwv2.HttpMethod.GET, "/watchlist", watchlist_fn)
        route("IntWatchlistPost", apigwv2.HttpMethod.POST, "/watchlist", watchlist_fn)
        route("IntWatchlistDelete", apigwv2.HttpMethod.DELETE, "/watchlist/{plate}", watchlist_fn)
        route("IntSearch", apigwv2.HttpMethod.GET, "/search", search_fn)
        route("IntClips", apigwv2.HttpMethod.GET, "/clips/{id+}", clips_fn)
        return http_api, user_pool, user_pool_client

    def _worker(
        self,
        media_bucket: s3.Bucket,
        alpr_queue: sqs.Queue,
        results_queue: sqs.Queue,
        events_table: dynamodb.Table,
        watchlist_table: dynamodb.Table,
        worker_asset: s3_assets.Asset,
    ) -> None:
        vpc = ec2.Vpc.from_lookup(self, "DefaultVpc", is_default=True)

        role = iam.Role(
            self,
            "Ec2Role",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore"),
            ],
        )
        alpr_queue.grant_consume_messages(role)
        alpr_queue.grant_send_messages(role)   # relay sends jobs to this queue
        results_queue.grant_send_messages(role)
        media_bucket.grant_read_write(role)
        events_table.grant_read_write_data(role)
        watchlist_table.grant_read_data(role)
        worker_asset.grant_read(role)
        role.add_to_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter", "ssm:PutParameter"],
                resources=[f"arn:aws:ssm:{self.region}:{self.account}:parameter/watchtell/*"],
            )
        )
        role.add_to_policy(
            iam.PolicyStatement(
                actions=["ec2:CreateImage", "ec2:CreateTags", "ec2:DescribeImages"],
                resources=["*"],
            )
        )

        instance_profile = iam.CfnInstanceProfile(self, "InstanceProfile", roles=[role.role_name])
        sg = ec2.SecurityGroup(
            self,
            "WorkerSg",
            vpc=vpc,
            description="WatchTell single EC2 worker - outbound only",
            allow_all_outbound=True,
        )

        user_data = ec2.UserData.for_linux()
        user_data.add_commands(
            "set -euo pipefail",
            "dnf install -y awscli unzip",
            "mkdir -p /opt/watchtell",
            f"aws s3 cp s3://{worker_asset.s3_bucket_name}/{worker_asset.s3_object_key} /tmp/watchtell-worker.zip --region {self.region}",
            "unzip -q /tmp/watchtell-worker.zip -d /opt/watchtell",
            "rm -f /tmp/watchtell-worker.zip",
            "chmod +x /opt/watchtell/install.sh",
            f"AWS_DEFAULT_REGION={self.region} AWS_ACCOUNT_ID={self.account} "
            "WATCHTELL_SKIP_S3_REFRESH=1 WATCHTELL_CREATE_AMI_IF_MISSING=1 ENABLE_LOCAL_HLS=0 "
            "bash /opt/watchtell/install.sh >> /var/log/watchtell-install.log 2>&1",
        )

        found_ami = _latest_owned_worker_ami(self.region)
        ami = os.environ.get("AMI_ID") or found_ami
        if not ami:
            ami = ec2.MachineImage.latest_amazon_linux2023().get_image(self).image_id

        launch_template = ec2.CfnLaunchTemplate(
            self,
            "LaunchTemplate",
            launch_template_data=ec2.CfnLaunchTemplate.LaunchTemplateDataProperty(
                image_id=ami,
                instance_type="t3a.medium",
                iam_instance_profile=ec2.CfnLaunchTemplate.IamInstanceProfileProperty(
                    arn=instance_profile.attr_arn,
                ),
                security_group_ids=[sg.security_group_id],
                user_data=cdk.Fn.base64(user_data.render()),
                instance_market_options=ec2.CfnLaunchTemplate.InstanceMarketOptionsProperty(
                    market_type="spot",
                    spot_options=ec2.CfnLaunchTemplate.SpotOptionsProperty(
                        max_price="0.08",
                        spot_instance_type="one-time",
                    ),
                ),
                block_device_mappings=[
                    ec2.CfnLaunchTemplate.BlockDeviceMappingProperty(
                        device_name="/dev/xvda",
                        ebs=ec2.CfnLaunchTemplate.EbsProperty(
                            volume_size=30,
                            volume_type="gp3",
                            delete_on_termination=True,
                        ),
                    )
                ],
                metadata_options=ec2.CfnLaunchTemplate.MetadataOptionsProperty(
                    http_tokens="required",
                    http_put_response_hop_limit=1,
                ),
            ),
        )

        asg = autoscaling.CfnAutoScalingGroup(
            self,
            "WorkerAsg",
            min_size="1",
            max_size="1",
            desired_capacity="1",
            vpc_zone_identifier=vpc.select_subnets(subnet_type=ec2.SubnetType.PUBLIC).subnet_ids,
            launch_template=autoscaling.CfnAutoScalingGroup.LaunchTemplateSpecificationProperty(
                launch_template_id=launch_template.ref,
                version=launch_template.attr_latest_version_number,
            ),
        )
        for writer in self._settings_writers:
            asg.node.add_dependency(writer)

    def _spa(
        self,
        api_url: str,
        user_pool: cognito.UserPool,
        user_pool_client: cognito.UserPoolClient,
    ) -> str:
        """Create an S3 bucket + CloudFront distribution to host the React SPA."""
        spa_bucket = s3.Bucket(
            self,
            "SpaBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        oac = cloudfront.CfnOriginAccessControl(
            self,
            "SpaOac",
            origin_access_control_config=cloudfront.CfnOriginAccessControl.OriginAccessControlConfigProperty(
                name=f"watchtell-spa-oac-{self.account}",
                origin_access_control_origin_type="s3",
                signing_behavior="always",
                signing_protocol="sigv4",
            ),
        )

        distribution = cloudfront.Distribution(
            self,
            "SpaCdn",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(spa_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            error_responses=[
                # Route all 403/404 back to index.html for client-side routing
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
            ],
        )

        # Override the OAC on the S3 origin (L1 workaround)
        cfn_dist = distribution.node.default_child
        cfn_dist.add_property_override(
            "DistributionConfig.Origins.0.OriginAccessControlId",
            oac.get_att("Id"),
        )
        cfn_dist.add_property_override(
            "DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity",
            "",
        )

        spa_bucket.add_to_resource_policy(
            iam.PolicyStatement(
                actions=["s3:GetObject"],
                principals=[iam.ServicePrincipal("cloudfront.amazonaws.com")],
                resources=[spa_bucket.arn_for_objects("*")],
                conditions={
                    "StringEquals": {
                        "AWS:SourceArn": f"arn:aws:cloudfront::{self.account}:distribution/{distribution.distribution_id}",
                    }
                },
            )
        )

        frontend_dir = ROOT_DIR / "frontend" / "dist"
        if frontend_dir.exists():
            s3_deploy.BucketDeployment(
                self,
                "SpaDeployment",
                sources=[s3_deploy.Source.asset(str(frontend_dir))],
                destination_bucket=spa_bucket,
                distribution=distribution,
                distribution_paths=["/*"],
                memory_limit=256,
            )

        CfnOutput(self, "SpaBucketName", value=spa_bucket.bucket_name)
        return f"https://{distribution.distribution_domain_name}"
