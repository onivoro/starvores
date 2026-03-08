output "pipe_arn" {
  description = "ARN of the created EventBridge Pipe"
  value       = aws_pipes_pipe.kinesis_to_lambda.arn
}
