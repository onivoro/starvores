output "user_pool_id" {
  description = "The ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  description = "The client ID of the Cognito User Pool client"
  value       = aws_cognito_user_pool_client.main.id
}
