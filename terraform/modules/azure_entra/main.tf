resource "azuread_application" "cognito_sso" {
  display_name     = var.application_name

  web {
    redirect_uris = ["https://${var.domain_prefix}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"]
  }

  sign_in_audience = "AzureADandPersonalMicrosoftAccount"

  api {
    requested_access_token_version = 2
    known_client_applications = []
  }

  feature_tags {
    enterprise = true
    gallery    = false
  }
}

resource "azuread_application_password" "cognito_sso" {
  display_name         = "cognito-sso-client-secret"
  end_date            = "2099-12-31T23:59:59Z"
  application_id      = azuread_application.cognito_sso.id
}

resource "azuread_service_principal" "cognito_sso" {
  client_id = azuread_application.cognito_sso.client_id
}