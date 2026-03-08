output "sagemaker_notebook_arn" {
  description = "The ARN of the SageMaker notebook instance."
  value       = aws_sagemaker_notebook_instance.notebook.arn
}

output "iam_role_arn" {
  description = "The ARN of the IAM role for SageMaker."
  value       = aws_iam_role.sagemaker_role.arn
}