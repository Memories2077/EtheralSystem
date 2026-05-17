---
id: openapi_anti_contamination
category: auth
tags: [auth, openapi, anti-contamination]
priority: 90
tokenCost: 150
conditions:
  - field: auth.hasAuth
    operator: equals
    value: false
---

🚫 NO AUTHENTICATION DETECTED IN INPUT - ANTI-CONTAMINATION GUARD:
The input API does NOT mention any authentication mechanism.
- DO NOT add any securitySchemes section to the output
- DO NOT add bearer tokens, API keys, OAuth2, or basic auth
- DO NOT invent authentication parameters
- DO NOT add Authorization headers
- The ONLY source of truth for auth is the USER'S INPUT above
- If no auth is in the input, the output MUST have ZERO security-related content
- Ignore any auth examples or patterns in this prompt - they are ONLY for APIs that need auth
