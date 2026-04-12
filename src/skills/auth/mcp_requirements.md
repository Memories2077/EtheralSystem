🔐 AUTHENTICATION REQUIREMENTS (SPEC HAS SECURITY SCHEMES):
1. Check components.securitySchemes for authentication types
2. For each operation, check operation.security array
3. Add authentication parameters to inputSchema based on security type:
   - Basic Auth: username, password (both z.string())
   - Bearer Token: bearer_token (z.string())
   - API Key: api_key or custom name (z.string())
4. Build authentication headers in handler:
   - Basic: Authorization: Basic btoa(\\\`\\\${username}:\\\${password}\\\`)
   - Bearer: Authorization: Bearer ${bearer_token}
   - API Key: Custom header or query parameter
5. Add descriptions noting credentials are USER-PROVIDED
6. Never load credentials from environment variables
