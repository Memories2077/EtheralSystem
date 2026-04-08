{{LAST_ERROR}}Generate a complete MCP server following this exact pattern:

TYPESCRIPT REFERENCE STRUCTURE (ONLY FOR REFERENCING):
{{REFERENCE_STRUCTURE}}

{{EXAMPLES_SECTION}}

NOW GENERATE FOR THIS YAML OPENAPI SPEC:
{{OPENAPI_SPEC}}

{{RAG_CONTEXT}}

🚨 CRITICAL CODE STRUCTURE - MUST FOLLOW THIS ORDER:
Step 1: Write ALL imports
Step 2: Write ALL constants (API_BASE_URL, USER_AGENT)
Step 3: Write ALL type definitions (interfaces)
Step 4: Write ALL helper functions (makeAPIRequest, formatResponse, etc.)
Step 5: Write server initialization (const server = new McpServer(...))
Step 6: Write ALL tool registrations (server.registerTool(...))
Step 7: Write main function
Step 8: Write main execution (main().catch(...))

⚠️ COMMON ERROR TO AVOID:
❌ Calling makeAPIRequest in tool handlers before defining it
✅ Define makeAPIRequest BEFORE creating server and registering tools

🚨 CRITICAL ANALYSIS REQUIRED:
1. Find ALL endpoints in paths section
2. For each endpoint, identify ALL parameters (path, query, body)
3. Convert ALL requestBody properties to separate Zod parameters
4. Ensure ALL optional fields are marked .optional()
5. Build request bodies dynamically from provided parameters
6. NEVER use undefined, null, or raw literals in inputSchema
7. ALWAYS use z.record(z.any()) for free-form objects
8. ALWAYS check !== undefined before adding to request body
9. ⚠️ DO NOT CREATE UNNECESSARY PARAMETERS - Only add parameters that are explicitly defined in the OpenAPI spec. DO NOT invent extra parameters like "bearer_token", "api_key", or other authentication fields if they are NOT specified in the spec's securitySchemes or requestBody

{{AUTH_SECTION}}

⚠️ ZOD SCHEMA REQUIREMENTS (CRITICAL - PREVENTS _zod ERROR):
🚨 CRITICAL: inputSchema MUST be z.object({...}) NOT plain object {...}
✅ For NO parameters: inputSchema: z.object({})
✅ For WITH parameters: inputSchema: z.object({ param: z.string(), ... })
✅ Every property inside z.object() MUST be a Zod schema (starts with z.)
✅ Use z.record(z.any()) for objects without defined structure
✅ Use z.object({...}) for objects with defined structure
✅ Mark optional fields with .optional() at the end
✅ Always add .describe() with clear description
❌ NEVER use plain object: inputSchema: { param: z.string() } ← WRONG!
❌ NEVER use: undefined, null, raw literals like {}, [], "string", 123

⚠️ STRING INTERPOLATION (CRITICAL - PREVENTS AUTH ERRORS):
✅ Use backticks for template strings: \\\`Bearer \\\${token}\\\`
❌ NEVER use quotes: 'Bearer \\\${token}' or "Bearer \\\${token}"

🚨 CRITICAL OUTPUT FORMAT:
❌ FORBIDDEN - Absolutely NO markdown formatting:
   ❌ No markdown headers (# Title, ## Subtitle)
   ❌ No markdown code blocks (three backticks)
   ❌ No markdown lists, emphasis, or any markdown syntax
   ❌ No explanatory text before/after the code
❌ FORBIDDEN - Do NOT copy or include examples
✅ REQUIRED - Start with EXACTLY: "import"
✅ REQUIRED - End with the last line of code
✅ REQUIRED - Be pure, executable TypeScript (no wrappers)

⚠️ OUTPUT REQUIREMENTS:
- Do NOT wrap the output in markdown code blocks (CRITICAL!)
- NO explanations or markdown formatting
- START directly with "import"
- IMPLEMENT EVERY ENDPOINT
- EVERY REQUEST BODY PROPERTY = SEPARATE ZOD PARAMETER
- EVERY INPUTSCHEMA PROPERTY = VALID ZOD SCHEMA
- For YAML output: Use proper 2-space indentation throughout
- For YAML output: Validate indentation at every nesting level

🚫 FORBIDDEN TEMPLATE SYNTAX:
❌ NEVER output Jinja2/Handlebars/EJS templates
❌ Output must be executable TypeScript or parseable YAML
✅ Use only standard TypeScript or YAML syntax
