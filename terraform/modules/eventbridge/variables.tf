variable "kinesis_stream_arn" {
  description = "ARN of the existing Kinesis stream"
  type        = string
}

variable "pipe_name" {
  description = "Name of the EventBridge Pipe"
  type        = string
  default = "ivinesis-to-lambda-pipe"
}

variable "lambda_arn" {
  description = "ARN of the Lambda function"
  type        = string
}