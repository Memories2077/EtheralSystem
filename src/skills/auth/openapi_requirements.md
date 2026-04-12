🚨 AUTHENTICATION REQUIREMENTS - CRITICAL:
{{INPUT_FORMAT}}

KEY PATTERNS TO FOLLOW:
1. HTTPBin Example: Simple REST API without authentication
2. Reddit Example: OAuth2 with Basic Auth for token endpoint + Bearer token for API calls
3. Twilio Example: Basic Auth with Account_SID:Auth_Token for all endpoints

AUTHENTICATION PATTERNS:
- Basic Auth: Use "basicAuth" security scheme with http/basic
- Bearer Token: Use "bearerAuth" security scheme with http/bearer
- OAuth2: Combine both - Basic Auth for token endpoint, Bearer for protected endpoints
- Always include detailed descriptions about required parameters
- Note when parameters are USER-PROVIDED (not from .env files)
- ⚠️ DO NOT CREATE UNNECESSARY PARAMETERS - Only add authentication parameters that are explicitly defined in the spec's securitySchemes. DO NOT invent extra parameters like "bearer_token", "api_key", or other authentication fields if they are NOT specified in the spec
