from aws_cdk import (
    Stack,
    Duration,
    aws_sqs as sqs,
)
from constructs import Construct


class QueueStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Dead-letter queue for failed ALPR jobs
        dlq = sqs.Queue(
            self, "AlprDlq",
            queue_name="watchtell-alpr-dlq",
            retention_period=Duration.days(14),
        )

        # Main ALPR processing queue
        # visibility_timeout matches worker processing budget (90s)
        self.alpr_queue = sqs.Queue(
            self, "AlprQueue",
            queue_name="watchtell-alpr-queue",
            visibility_timeout=Duration.seconds(90),
            retention_period=Duration.days(4),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=dlq,
            ),
        )
