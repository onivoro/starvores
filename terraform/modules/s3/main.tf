resource "aws_s3_bucket" "firehose_bucket" {
  bucket = var.bucket_name
  force_destroy = true
}
