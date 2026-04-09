#!/usr/bin/env python3
import aws_cdk as cdk
from watchtell.storage_stack import StorageStack
from watchtell.queue_stack import QueueStack
from watchtell.compute_stack import ComputeStack
from watchtell.pipeline_stack import PipelineStack
from watchtell.api_stack import ApiStack
from watchtell.cdn_stack import CdnStack
from watchtell.security_stack import SecurityStack

app = cdk.App()

env = cdk.Environment(account="916918686359", region="us-east-1")

storage = StorageStack(app, "WatchtellStorage", env=env)
queue = QueueStack(app, "WatchtellQueue", env=env)
compute = ComputeStack(
    app, "WatchtellCompute",
    events_table=storage.events_table,
    watchlist_table=storage.watchlist_table,
    media_bucket=storage.media_bucket,
    alpr_queue=queue.alpr_queue,
    env=env,
)
pipeline = PipelineStack(
    app, "WatchtellPipeline",
    events_table=storage.events_table,
    watchlist_table=storage.watchlist_table,
    media_bucket=storage.media_bucket,
    alpr_queue=queue.alpr_queue,
    env=env,
)
api = ApiStack(
    app, "WatchtellApi",
    events_table=storage.events_table,
    watchlist_table=storage.watchlist_table,
    media_bucket=storage.media_bucket,
    pipeline_arn=pipeline.state_machine_arn,
    env=env,
)
cdn = CdnStack(
    app, "WatchtellCdn",
    api_url=api.api_url,
    go2rtc_host="23.125.22.17.nip.io",
    go2rtc_port=4032,
    env=env,
)
security = SecurityStack(
    app, "WatchtellSecurity",
    media_bucket=storage.media_bucket,
    events_table=storage.events_table,
    api_id=api.http_api_id,
    env=env,
)

app.synth()
