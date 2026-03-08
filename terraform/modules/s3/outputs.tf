output "bucket_arn" {
  value = aws_s3_bucket.firehose_bucket.arn
}

output "bucket_name" {
  value = aws_s3_bucket.firehose_bucket.bucket
}

output "bucket_region" {
  value = aws_s3_bucket.firehose_bucket.region
}