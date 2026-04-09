"""
Phase 2: Step Functions pipeline + Lambda functions + SNS alerts.

Pipeline flow:
  SQS message (ALPR result) → ParseResult → ValidatePlate → StoreEvent → CheckWatchlist → [Alert]
"""
import json
from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as lambda_,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
    aws_sqs as sqs,
    aws_s3 as s3,
    aws_dynamodb as dynamodb,
    aws_iam as iam,
    aws_lambda_event_sources as event_sources,
)
from constructs import Construct

LAMBDA_RUNTIME = lambda_.Runtime.PYTHON_3_12
LAMBDA_TIMEOUT = Duration.seconds(30)


class PipelineStack(Stack):
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

        # SNS topic for watchlist hit alerts
        alerts_topic = sns.Topic(
            self, "AlertsTopic",
            topic_name="watchtell-alerts",
            display_name="WatchTell Alerts",
        )
        self.alerts_topic_arn = alerts_topic.topic_arn

        # Shared Lambda environment
        shared_env = {
            "EVENTS_TABLE": events_table.table_name,
            "WATCHLIST_TABLE": watchlist_table.table_name,
            "MEDIA_BUCKET": media_bucket.bucket_name,
            "ALERTS_TOPIC_ARN": alerts_topic.topic_arn,
        }

        # Lambda: parse ALPR result from SQS message
        parse_fn = self._lambda("ParseResult", "pipeline/parse_result.handler", shared_env)

        # Lambda: validate plate — Upstash Redis cache → SearchQuarry plate lookup
        validate_fn = self._lambda("ValidatePlate", "pipeline/validate_plate.handler", {
            **shared_env,
            "UPSTASH_REDIS_URL": "{{resolve:ssm:/watchtell/upstash/url}}",
            "UPSTASH_REDIS_TOKEN": "{{resolve:ssm:/watchtell/upstash/token}}",
            "SEARCHQUARRY_API_KEY": "{{resolve:ssm:/watchtell/searchquarry/api_key}}",
        })

        # Lambda: store event in DynamoDB
        store_fn = self._lambda("StoreEvent", "pipeline/store_event.handler", shared_env)

        # Lambda: check watchlist and dispatch alert if hit
        alert_fn = self._lambda("CheckWatchlist", "pipeline/check_watchlist.handler", shared_env)

        # Lambda: trigger Step Functions from SQS
        trigger_fn = self._lambda("SqsTrigger", "pipeline/sqs_trigger.handler", shared_env)

        # Permissions
        events_table.grant_read_write_data(store_fn)
        events_table.grant_read_write_data(trigger_fn)
        watchlist_table.grant_read_data(alert_fn)
        watchlist_table.grant_read_data(trigger_fn)
        media_bucket.grant_read_write(parse_fn)
        alerts_topic.grant_publish(alert_fn)

        # Step Functions state machine
        parse_task = tasks.LambdaInvoke(
            self, "ParseResultTask",
            lambda_function=parse_fn,
            output_path="$.Payload",
        )
        validate_task = tasks.LambdaInvoke(
            self, "ValidatePlateTask",
            lambda_function=validate_fn,
            output_path="$.Payload",
        )
        store_task = tasks.LambdaInvoke(
            self, "StoreEventTask",
            lambda_function=store_fn,
            output_path="$.Payload",
        )
        alert_task = tasks.LambdaInvoke(
            self, "CheckWatchlistTask",
            lambda_function=alert_fn,
            output_path="$.Payload",
        )

        definition = (
            parse_task
            .next(validate_task)
            .next(store_task)
            .next(alert_task)
        )

        state_machine = sfn.StateMachine(
            self, "Pipeline",
            state_machine_name="watchtell-pipeline",
            definition_body=sfn.DefinitionBody.from_chainable(definition),
            timeout=Duration.minutes(5),
        )
        self.state_machine_arn = state_machine.state_machine_arn

        # Allow SQS trigger Lambda to start executions
        state_machine.grant_start_execution(trigger_fn)
        trigger_fn.add_environment("STATE_MACHINE_ARN", state_machine.state_machine_arn)

        # Wire SQS → trigger Lambda
        trigger_fn.add_event_source(
            event_sources.SqsEventSource(
                alpr_queue,
                batch_size=1,
                max_batching_window=Duration.seconds(0),
            )
        )

    def _lambda(self, name: str, handler: str, env: dict) -> lambda_.Function:
        return lambda_.Function(
            self, name,
            function_name=f"watchtell-{name.lower().replace(' ', '-')}",
            runtime=LAMBDA_RUNTIME,
            handler=handler,
            code=lambda_.Code.from_asset("../api"),
            timeout=LAMBDA_TIMEOUT,
            environment=env,
            memory_size=256,
        )
