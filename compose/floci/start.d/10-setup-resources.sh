#!/bin/bash

# S3 buckets
#aws s3 mb s3://my-bucket

# SQS queues

# waste receiver backend processing queue
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name glw-poc-background-process

echo READY > /tmp/READY
# end of copypasta

