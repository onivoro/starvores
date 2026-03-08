resource "aws_kinesis_stream" "kinesis" {
  name   = var.stream_name
  shard_count = var.shard_count
  retention_period = 24
}
