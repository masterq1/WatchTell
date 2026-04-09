"""
Phase 3: CloudFront distribution — SPA hosting + pre-signed media CDN.
"""
import aws_cdk as cdk
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
    aws_s3 as s3,
)
from constructs import Construct


class CdnStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        api_url: str,
        go2rtc_host: str = "",
        go2rtc_port: int = 1984,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # S3 bucket for SPA static assets
        spa_bucket = s3.Bucket(
            self, "SpaBucket",
            bucket_name=f"watchtell-spa-{self.account}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Dedicated HLS bucket — lives in this stack to avoid cross-stack OAC cycle.
        # EC2 role (watchtell-ec2-role, known ARN) is granted write access via resource policy.
        hls_bucket = s3.Bucket(
            self, "HlsBucket",
            bucket_name=f"watchtell-hls-{self.account}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )
        hls_bucket.add_to_resource_policy(iam.PolicyStatement(
            actions=["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
            principals=[iam.ArnPrincipal(
                f"arn:aws:iam::{self.account}:role/watchtell-ec2-role"
            )],
            resources=[hls_bucket.arn_for_objects("*")],
        ))
        hls_bucket.add_to_resource_policy(iam.PolicyStatement(
            actions=["s3:ListBucket"],
            principals=[iam.ArnPrincipal(
                f"arn:aws:iam::{self.account}:role/watchtell-ec2-role"
            )],
            resources=[hls_bucket.bucket_arn],
        ))

        oac = cloudfront.S3OriginAccessControl(
            self, "Oac",
            description="WatchTell SPA OAC",
        )

        # CloudFront distribution
        distribution = cloudfront.Distribution(
            self, "Distribution",
            comment="watchtell-cdn",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    spa_bucket,
                    origin_access_control=oac,
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True,
            ),
            additional_behaviors={
                "/api/*": cloudfront.BehaviorOptions(
                    origin=origins.HttpOrigin(
                        cdk.Fn.select(1, cdk.Fn.split("://", api_url)),
                        protocol_policy=cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                    ),
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                    allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                    cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                ),
            },
            # SPA routing: serve index.html for all 403/404s
            error_responses=[
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
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
        )

        # HLS live stream behavior — no caching so m3u8 playlist is always fresh
        distribution.add_behavior(
            "/hls/*",
            origins.S3BucketOrigin.with_origin_access_control(hls_bucket),
            viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
            cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
            allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        )

        # go2rtc proxy behavior — strips /go2rtc prefix before forwarding to origin
        if go2rtc_host:
            strip_prefix_fn = cloudfront.Function(
                self, "Go2rtcStripPrefix",
                code=cloudfront.FunctionCode.from_inline(
                    "function handler(event){"
                    "var r=event.request;"
                    "r.uri=r.uri.replace(/^\\/go2rtc/,'')||'/';"
                    "return r;}"
                ),
            )
            distribution.add_behavior(
                "/go2rtc/*",
                origins.HttpOrigin(
                    go2rtc_host,
                    http_port=go2rtc_port,
                    protocol_policy=cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                origin_request_policy=cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                function_associations=[
                    cloudfront.FunctionAssociation(
                        function=strip_prefix_fn,
                        event_type=cloudfront.FunctionEventType.VIEWER_REQUEST,
                    )
                ],
            )

        CfnOutput(self, "DistributionDomain", value=distribution.distribution_domain_name)
        CfnOutput(self, "SpaBucketName", value=spa_bucket.bucket_name)
        CfnOutput(self, "HlsBucketName", value=hls_bucket.bucket_name)
