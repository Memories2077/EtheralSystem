// OpenAPI Schema to Zod Schema Mapping (Latest MCP Server Syntax)
CONVERSION RULES:

1. OpenAPI requestBody -> Zod Parameters:
   - Analyze components/schemas referenced in requestBody
   - Create individual Zod parameters for each top-level property
   - Handle nested objects as separate z.object() schemas

2. Property Type Mapping:
   OpenAPI type: string -> z.string()
   OpenAPI type: integer -> z.number()
   OpenAPI type: boolean -> z.boolean()
   OpenAPI type: array -> z.array(z.type())
   OpenAPI type: object (with defined properties) -> z.object({ ... })
   OpenAPI type: object (without defined properties, free-form) -> z.record(z.any())
   OpenAPI type: object (additionalProperties: true) -> z.record(z.any())
   OpenAPI required: false -> z.optional()

3. CRITICAL - Free-form Objects:
   When an OpenAPI schema has:
   - type: object WITHOUT properties defined
   - additionalProperties: true
   - A field named "properties" that accepts any key-value pairs
   
   Convert to: z.record(z.any())
   
   Example:
   // OpenAPI:
   properties:
     type: object
     description: Key-value pairs
   
   // Zod:
   properties: z.record(z.any()).optional().describe("Key-value pairs")

4. Complex Objects Pattern:
   // OpenAPI Schema:
   UpdatePageRequest:
     properties:
       properties: { type: object }
       archived: { type: boolean }
       icon: 
         type: object
         properties:
           type: { enum: [emoji] }
           emoji: { type: string }
   
   // Convert to Zod (Latest MCP Server Syntax):
   server.registerTool(
     "update-page",
     {
         title: "Update a page",
         description: "Update a page with new properties, archive status, or icon.",
         inputSchema: z.object({
             page_id: z.string().describe("Page ID"),
             properties: z.record(z.any()).optional().describe("Page properties to update"),
             archived: z.boolean().optional().describe("Archive status"),
             icon: z.object({
                 type: z.literal("emoji"),
                 emoji: z.string()
             }).optional().describe("Page icon"),
             cover: z.object({
                 type: z.enum(["external", "file"]),
                 external: z.object({
                     url: z.string().url()
                 }).optional()
             }).optional().describe("Page cover image")
         })
     },
     async ({ page_id, properties, archived, icon, cover }) => {
         const requestBody: any = {};
         if (properties !== undefined) requestBody.properties = properties;
         if (archived !== undefined) requestBody.archived = archived;
         if (icon !== undefined) requestBody.icon = icon;
         if (cover !== undefined) requestBody.cover = cover;
         
         const { data: response, error } = await makeAPIRequest(url, {
             method: 'PATCH',
             headers: {
                 'Content-Type': 'application/json'
             },
             body: JSON.stringify(requestBody)
         });
         
         if (error || !response) {
             return {
                 content: [{ type: "text", text: \`Failed to update page. Error: \${error || "Unknown error"}\` }],
             };
         }
                // Handle successful response...
            }
        );

        5. CRITICAL - Nested Optional Objects:
        When handling nested optional objects, ALWAYS:
        - Mark parent object as .optional()
        - Check if value !== undefined before adding to request body
        - Use proper null checks in the handler function
        
        Example:
        inputSchema: z.object({
            parent: z.object({
                child: z.object({
                    value: z.string()
                }).optional()
            }).optional()
        })
        
        Handler:
        if (parent !== undefined) {
            requestBody.parent = parent;
        }

DYNAMIC REQUEST BODY HANDLING:
1. Analyze OpenAPI requestBody schema
2. Generate appropriate Zod schema:
   - Simple objects: z.object({})
   - Arrays: z.array(z.type())
   - Mixed types: z.union([])
   - Optional fields: z.optional()
   - Nested objects: recursive z.object()
3. Handle different content types
4. Validate before sending request
