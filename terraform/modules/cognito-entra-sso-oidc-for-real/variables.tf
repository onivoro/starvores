variable "user_pool_name" {
  description = "The name of the Cognito User Pool"
  type        = string
  default     = "terraz"
}

variable "domain_prefix" {
  description = "The prefix for the Cognito domain"
  type        = string
}

variable "callback_urls" {
  description = "List of allowed callback URLs for the identity providers"
  type        = list(string)
}

variable "entra_tenant_id" {
  description = "The tenant ID of the Azure AD application"
  type        = string
}

variable "azure_client_id" {
  description = "The client ID of the Azure AD application"
  type        = string
}

variable "azure_client_secret" {
  description = "The client secret of the Azure AD application"
  type        = string
  sensitive   = true
}

variable "admin_create_user_only" {
  description = "Set to true if only administrators can create users"
  type        = bool
  default     = false
}

variable "logout_urls" {
  description = "List of allowed logout URLs for the Cognito user pool client."
  type        = list(string)
}