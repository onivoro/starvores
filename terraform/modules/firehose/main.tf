resource "aws_iam_role" "firehose_role" {
  name = "firehose_delivery_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRole",
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "firehose_kinesis_policy" {
  name = "firehose_kinesis_policy"
  role = aws_iam_role.firehose_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "kinesis:DescribeStream",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords"
        ],
        Resource = var.kinesis_stream_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "firehose_policy_attachment" {
  role       = aws_iam_role.firehose_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}


resource "aws_iam_role_policy_attachment" "firehose_policy_attachment_redshift" {
  role       = aws_iam_role.firehose_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonRedshiftFullAccess"
}

module "s3_bucket" {
  source      = "../../modules/s3"
  bucket_name = var.firehose_name
}

resource "aws_kinesis_firehose_delivery_stream" "firehose" {
  name        = "${var.firehose_name}"
  destination = "redshift"

  kinesis_source_configuration {
    kinesis_stream_arn = var.kinesis_stream_arn
    role_arn           = aws_iam_role.firehose_role.arn
  }

  redshift_configuration {
    cluster_jdbcurl = "jdbc:redshift://${var.redshift_cluster}/${var.redshift_database}"
    username        = var.redshift_master_username
    password        = var.redshift_master_password
    role_arn        = var.redshift_role_arn
    data_table_name    = "firehose"
    data_table_columns = "source, type, data"
    copy_options        = "JSON 'auto'"

    cloudwatch_logging_options {
      enabled = true
      log_group_name = var.firehose_name
      log_stream_name = var.firehose_name
    }

    s3_configuration {
      role_arn   = aws_iam_role.firehose_role.arn
      bucket_arn = module.s3_bucket.bucket_arn
    }
  }
}
