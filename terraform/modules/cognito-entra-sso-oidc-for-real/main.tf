resource "aws_cognito_user_pool" "main" {
  name = var.user_pool_name

  admin_create_user_config {
    allow_admin_create_user_only = var.admin_create_user_only
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable            = true

    string_attribute_constraints {
      min_length = 3
      max_length = 256
    }
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "azure" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Azure"
  provider_type = "OIDC"

  provider_details = {
    client_id                     = var.azure_client_id
    client_secret                 = var.azure_client_secret
    oidc_issuer                  = "https://login.microsoftonline.com/${var.entra_tenant_id}/v2.0"
    authorize_scopes             = "openid profile email"
    attributes_request_method    = "GET"
    authorize_url               = "https://login.microsoftonline.com/${var.entra_tenant_id}/oauth2/v2.0/authorize"
    token_url                  = "https://login.microsoftonline.com/${var.entra_tenant_id}/oauth2/v2.0/token"
    attributes_url             = "https://graph.microsoft.com/oidc/userinfo"
    jwks_uri                   = "https://login.microsoftonline.com/${var.entra_tenant_id}/discovery/v2.0/keys"
    attributes_url_add_attributes = "false"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
  }
}

resource "aws_cognito_user_pool_client" "main" {
  name                                 = "${var.user_pool_name}-client"
  user_pool_id                        = aws_cognito_user_pool.main.id
  generate_secret                     = false
  allowed_oauth_flows                 = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                = ["openid", "email"]
  callback_urls                       = var.callback_urls
  logout_urls                         = var.logout_urls
  supported_identity_providers        = [aws_cognito_identity_provider.azure.provider_name]
  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  depends_on                         = [aws_cognito_identity_provider.azure]
}