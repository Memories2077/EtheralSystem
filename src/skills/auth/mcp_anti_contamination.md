🚫 NO SECURITY SCHEMES IN SPEC - ANTI-CONTAMINATION GUARD:
The OpenAPI spec does NOT contain any securitySchemes or security requirements.
- DO NOT add bearer_token, api_key, username, password, or any auth parameters
- DO NOT add Authorization headers in the tool handlers
- DO NOT invent authentication mechanisms not in the spec
- Keep tool handlers simple with NO auth logic
