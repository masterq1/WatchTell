import aws_cdk as cdk
from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_autoscaling as autoscaling,
    aws_s3 as s3,
    aws_sqs as sqs,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class ComputeStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        events_table: dynamodb.Table,
        watchlist_table: dynamodb.Table,
        media_bucket: s3.Bucket,
        alpr_queue: sqs.Queue,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        vpc = ec2.Vpc.from_lookup(self, "DefaultVpc", is_default=True)

        # IAM role for EC2 worker
        role = iam.Role(
            self, "Ec2Role",
            role_name="watchtell-ec2-role",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore"),
            ],
        )

        alpr_queue.grant_consume_messages(role)
        alpr_queue.grant_send_messages(role)
        media_bucket.grant_read_write(role)
        events_table.grant_read_write_data(role)
        watchlist_table.grant_read_data(role)

        # SSM parameter reads for relay config (RTSP URL, camera ID)
        role.add_to_policy(iam.PolicyStatement(
            actions=["ssm:GetParameter"],
            resources=[
                f"arn:aws:ssm:{self.region}:{self.account}:parameter/watchtell/relay/*",
            ],
        ))

        deploy_bucket = s3.Bucket.from_bucket_name(self, "DeployBucket", "watchtell-deploy")
        deploy_bucket.grant_read(role)

        instance_profile = iam.CfnInstanceProfile(
            self, "InstanceProfile",
            roles=[role.role_name],
        )

        # Security group — outbound only
        sg = ec2.SecurityGroup(
            self, "WorkerSg",
            vpc=vpc,
            description="WatchTell ALPR worker - outbound only",
            allow_all_outbound=True,
        )

        # User data — bootstrap only; install.sh (in the worker tarball) does the rest
        user_data = ec2.UserData.for_linux()
        user_data.add_commands(
            "set -euo pipefail",
            "aws s3 cp s3://watchtell-deploy/worker/latest.tar.gz /tmp/watchtell-worker.tar.gz",
            "mkdir -p /opt/watchtell",
            "tar -xzf /tmp/watchtell-worker.tar.gz -C /opt/watchtell --strip-components=1",
            "rm /tmp/watchtell-worker.tar.gz",
            f"AWS_DEFAULT_REGION={self.region} AWS_ACCOUNT_ID={self.account} "
            "bash /opt/watchtell/install.sh >> /var/log/watchtell-install.log 2>&1",
        )

        # L1 CfnLaunchTemplate — gives full control over mixed instances Spot config
        # Use Amazon Linux 2023 x86_64 AMI (resolved via SSM parameter)
        ami = ec2.MachineImage.latest_amazon_linux2023().get_image(self).image_id

        cfn_lt = ec2.CfnLaunchTemplate(
            self, "LaunchTemplate",
            launch_template_name="watchtell-alpr-spot",
            launch_template_data=ec2.CfnLaunchTemplate.LaunchTemplateDataProperty(
                image_id=ami,
                iam_instance_profile=ec2.CfnLaunchTemplate.IamInstanceProfileProperty(
                    arn=instance_profile.attr_arn,
                ),
                security_group_ids=[sg.security_group_id],
                user_data=cdk.Fn.base64(user_data.render()),
                block_device_mappings=[
                    ec2.CfnLaunchTemplate.BlockDeviceMappingProperty(
                        device_name="/dev/xvda",
                        ebs=ec2.CfnLaunchTemplate.EbsProperty(
                            volume_size=20,
                            volume_type="gp3",
                            delete_on_termination=True,
                        ),
                    )
                ],
                # No instance type here — overridden per-override in mixed instances policy
                metadata_options=ec2.CfnLaunchTemplate.MetadataOptionsProperty(
                    http_tokens="required",   # IMDSv2
                    http_put_response_hop_limit=1,
                ),
            ),
        )

        # L1 CfnAutoScalingGroup — multi-instance-type Spot pool
        # x86_64 pool (t3a/t3/m5a/m5) — keeps costs low while maximising availability
        cfn_asg = autoscaling.CfnAutoScalingGroup(
            self, "AlprAsg",
            auto_scaling_group_name="watchtell-alpr-asg",
            min_size="1",
            max_size="1",
            desired_capacity="1",
            vpc_zone_identifier=vpc.select_subnets(
                subnet_type=ec2.SubnetType.PUBLIC,
            ).subnet_ids,
            mixed_instances_policy=autoscaling.CfnAutoScalingGroup.MixedInstancesPolicyProperty(
                launch_template=autoscaling.CfnAutoScalingGroup.LaunchTemplateProperty(
                    launch_template_specification=autoscaling.CfnAutoScalingGroup.LaunchTemplateSpecificationProperty(
                        launch_template_id=cfn_lt.ref,
                        version=cfn_lt.attr_latest_version_number,
                    ),
                    overrides=[
                        autoscaling.CfnAutoScalingGroup.LaunchTemplateOverridesProperty(
                            instance_type=t
                        )
                        for t in [
                            "t3a.small", "t3a.medium",
                            "t3.small",  "t3.medium",
                            "m5a.large", "m5.large",
                        ]
                    ],
                ),
                instances_distribution=autoscaling.CfnAutoScalingGroup.InstancesDistributionProperty(
                    on_demand_base_capacity=0,
                    on_demand_percentage_above_base_capacity=0,
                    spot_allocation_strategy="price-capacity-optimized",
                    spot_max_price="0.0096",
                ),
            ),
        )

        # Lifecycle hook — 90s drain on termination
        autoscaling.CfnLifecycleHook(
            self, "TerminationDrain",
            auto_scaling_group_name=cfn_asg.ref,
            lifecycle_transition="autoscaling:EC2_INSTANCE_TERMINATING",
            heartbeat_timeout=90,
            default_result="CONTINUE",
        )

        CfnOutput(self, "AsgName", value=cfn_asg.ref)
        CfnOutput(self, "WorkerRoleArn", value=role.role_arn)
