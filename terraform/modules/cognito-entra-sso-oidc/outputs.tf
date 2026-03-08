output "user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.entraid_user_pool.id
}

output "app_client_id" {
  description = "ID of the Cognito App Client"
  value       = aws_cognito_user_pool_client.entraid_app_client.id
}

output "app_client_secret" {
  description = "Client secret for the Cognito App Client"
  value       = aws_cognito_user_pool_client.entraid_app_client.client_secret
  sensitive   = true
}