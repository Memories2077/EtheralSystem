---
id: mcp_request_patterns
category: mcp
tags: [request, patterns, http, pagination]
priority: 75
tokenCost: 350
---

// For POST/PUT/PATCH endpoints with request body (Latest MCP Server Syntax)
server.registerTool(
    "create-resource",
    {
        title: "Create a new resource",
        description: "Create a new resource with simple or complex body.",
        inputSchema: z.object({
            // Simple body
            data: z.object({
                name: z.string(),
                email: z.string().email(),
            }).describe("Resource data"),
            // Or complex nested body
            complexData: z.object({
                user: z.object({
                    profile: z.object({
                        settings: z.record(z.any())
                    })
                }),
                tags: z.array(z.string()),
                metadata: z.record(z.any()).optional()
            }).describe("Complex resource data"),
        })
    },
    async ({ data, complexData }) => {
        const body = complexData || data;
        const { data: result, error } = await makeAPIRequest<ResponseType>(url, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
        });
        
        if (error || !result) {
            return {
                content: [{
                    type: "text",
                    text: \`Failed to create resource. Error: \${error || "Unknown error"}\`
                }],
            };
        }
        // Handle successful response...
    }
);

// CRITICAL: Always include Content-Type header for POST/PUT/PATCH requests
// Different content types require different body formatting

// Handle different content types
function buildRequestOptions(body: any, contentType: string): RequestInit {
    const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
    };
    
    let processedBody: string | FormData;
    
    switch (contentType) {
        case 'application/json':
            headers['Content-Type'] = 'application/json';
            processedBody = JSON.stringify(body);
            break;
        case 'application/x-www-form-urlencoded':
            // CRITICAL: Required for OAuth token endpoints and form submissions
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            processedBody = new URLSearchParams(body).toString();
            break;
        case 'multipart/form-data':
            // Don't set Content-Type, let browser set with boundary
            processedBody = new FormData();
            Object.entries(body).forEach(([key, value]) => {
                processedBody.append(key, value as string);
            });
            break;
        default:
            headers['Content-Type'] = 'application/json';
            processedBody = JSON.stringify(body);
    }
    
    return { headers, body: processedBody };
}

// BEST PRACTICE: For most POST/PUT/PATCH requests with JSON body:
const { data: result, error } = await makeAPIRequest<ResponseType>(url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json", // CRITICAL: Always include for JSON payloads
        "Accept": "application/json"
    },
    body: JSON.stringify(requestBody)
});
