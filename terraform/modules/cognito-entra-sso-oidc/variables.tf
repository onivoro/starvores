variable "user_pool_name" {
  description = "Name of the Cognito User Pool"
  type        = string
}

variable "app_client_name" {
  description = "Name of the Cognito User Pool Client"
  type        = string
}

variable "callback_urls" {
  description = "OAuth callback URL for the application"
  type        = list(string)
}

# variable "logout_url" {
#   description = "OAuth logout URL for the application"
#   type        = string
# }

variable "entraid_client_id" {
  description = "Client ID from Microsoft Entra ID application"
  type        = string
}

variable "entraid_client_secret" {
  description = "Client Secret from Microsoft Entra ID application"
  type        = string
  sensitive   = true
}

variable "entraid_tenant_id" {
  description = "Microsoft Entra ID tenant ID"
  type        = string
}