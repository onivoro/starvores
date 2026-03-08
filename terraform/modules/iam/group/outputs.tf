output "group_name" {
  description = "Name of the created IAM group"
  value       = aws_iam_group.group.name
}

output "group_arn" {
  description = "ARN of the created IAM group"
  value       = aws_iam_group.group.arn
}