#!/usr/bin/env python3
import aws_cdk as cdk
from watchtell.single_stack import SingleStack

app = cdk.App()

env = cdk.Environment(account="916918686359", region="us-east-1")

SingleStack(app, "WatchtellSingle", env=env)

app.synth()
