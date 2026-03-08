resource "aws_iam_role" "pipe_role" {
  name = "${var.pipe_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "pipes.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "pipe_policy" {
  name = "${var.pipe_name}-policy"
  role = aws_iam_role.pipe_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:DescribeStream",
          "kinesis:ListShards"
        ]
        Resource = var.kinesis_stream_arn
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = var.lambda_arn
      },
      {
        Action   = [
            "cloudwatch:*",
          ]
        Effect   = "Allow"
        Resource = "*"
      },
    ]
  })
}

resource "aws_pipes_pipe" "kinesis_to_lambda" {
  name     = var.pipe_name
  role_arn = aws_iam_role.pipe_role.arn

  source = var.kinesis_stream_arn
  target = var.lambda_arn

  source_parameters {
    kinesis_stream_parameters {
      starting_position = "LATEST"
      batch_size        = 500
      maximum_batching_window_in_seconds = 1
      maximum_retry_attempts = -1
      maximum_record_age_in_seconds = -1
      parallelization_factor = 10
      on_partial_batch_item_failure     = "AUTOMATIC_BISECT"
      dead_letter_config {
        arn = "arn:aws:sqs:us-east-2:894874766323:ivinesis-dlq"
      }
    }
  }

  target_parameters {
    lambda_function_parameters {
      invocation_type = "REQUEST_RESPONSE"
    }
  }

  log_configuration {
    level                  = "TRACE"

    cloudwatch_logs_log_destination {
        log_group_arn = "arn:aws:logs:us-east-2:894874766323:log-group:/aws/vendedlogs/pipes/ivinesis-to-lambda-pipe"
    }
  }
}
