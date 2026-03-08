output "client_id" {
  description = "The Application ID of the Azure AD application"
  value       = azuread_application.cognito_sso.client_id
}

output "client_secret" {
  description = "The client secret of the Azure AD application"
  value       = azuread_application_password.cognito_sso.value
  sensitive   = true
}