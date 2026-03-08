resource "aws_cognito_user_pool" "entraid_user_pool" {
  name = var.user_pool_name

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

#   schema {
#     name                = "name"
#     attribute_data_type = "String"
#     required            = false
#     mutable             = true
#   }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
}

resource "aws_cognito_user_pool_client" "entraid_app_client" {
  name                                  = var.app_client_name
  user_pool_id                          = aws_cognito_user_pool.entraid_user_pool.id
  generate_secret                       = true
  allowed_oauth_flows                   = ["code"]
  allowed_oauth_scopes                  = ["email", "openid", "profile"]
  allowed_oauth_flows_user_pool_client  = true
  callback_urls                         = var.callback_urls
  # logout_urls                           = [var.logout_url]
  # access_token_validity                 = 60
  # id_token_validity                     = 60
  # refresh_token_validity                = 30
  prevent_user_existence_errors         = "ENABLED"
}

resource "aws_cognito_identity_provider" "entraid_oidc" {
  user_pool_id   = aws_cognito_user_pool.entraid_user_pool.id
  provider_name  = "MicrosoftEntraID"
  provider_type  = "OIDC"

  provider_details = {
    client_id                 = var.entraid_client_id
    client_secret             = var.entraid_client_secret
    authorize_scopes          = "openid email profile"
    oidc_issuer               = "https://login.microsoftonline.com/${var.entraid_tenant_id}/v2.0"
    attributes_request_method = "GET"
    authorize_url             = "https://login.microsoftonline.com/${var.entraid_tenant_id}/oauth2/v2.0/authorize"
    token_url                 = "https://login.microsoftonline.com/${var.entraid_tenant_id}/oauth2/v2.0/token"
    attributes_url            = "https://graph.microsoft.com/oidc/userinfo"
    jwks_uri                  = "https://login.microsoftonline.com/${var.entraid_tenant_id}/discovery/v2.0/keys"
  }

  attribute_mapping = {
    "email" = "email"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain = "${var.app_client_name}"
  user_pool_id = aws_cognito_user_pool.entraid_user_pool.id
}