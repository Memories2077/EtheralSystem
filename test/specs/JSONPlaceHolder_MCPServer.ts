import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express, { Request, Response } from 'express';
import cors from "cors";
import { randomUUID } from "node:crypto";

const JSONPLACEHOLDER_API_BASE = "https://jsonplaceholder.typicode.com";
const USER_AGENT = "jsonplaceholder-mcp/2.0";

// Helper function for making JSONPlaceholder API requests
async function makeJSONPlaceholderRequest<T>(url: string, options: RequestInit = {}): Promise<T | null> {
    const headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        ...options.headers,
    };

    try {
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return (await response.json()) as T;
    } catch (error) {
        console.error("Error making JSONPlaceholder request:", error);
        return null;
    }
}

// Interface definitions
interface Post {
    id: number;
    userId: number;
    title: string;
    body: string;
}

interface User {
    id: number;
    name: string;
    username: string;
    email: string;
    address?: {
        street: string;
        suite: string;
        city: string;
        zipcode: string;
        geo: {
            lat: string;
            lng: string;
        };
    };
    phone?: string;
    website?: string;
    company?: {
        name: string;
        catchPhrase: string;
        bs: string;
    };
}

interface Comment {
    id: number;
    postId: number;
    name: string;
    email: string;
    body: string;
}

interface Album {
    id: number;
    userId: number;
    title: string;
}

interface Photo {
    id: number;
    albumId: number;
    title: string;
    url: string;
    thumbnailUrl: string;
}

interface Todo {
    id: number;
    userId: number;
    title: string;
    completed: boolean;
}

// Create MCP server
const server = new McpServer({
    name: "jsonplaceholder",
    version: "2.0.0"
});

// Posts tools
server.registerTool("get-posts",
    {
        title: "Get Posts",
        description: "Get all posts with optional pagination",
        inputSchema: {
            limit: z.number().optional().describe("Limit number of results"),
            page: z.number().optional().describe("Page number for pagination"),
        }
    },
    async ({ limit, page }) => {
        let url = `${JSONPLACEHOLDER_API_BASE}/posts`;
        const params = new URLSearchParams();

        if (limit) params.append("_limit", limit.toString());
        if (page) params.append("_page", page.toString());

        if (params.toString()) url += `?${params.toString()}`;

        const posts = await makeJSONPlaceholderRequest<Post[]>(url);

        if (!posts) {
            return {
                content: [{ type: "text", text: "Failed to retrieve posts" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${posts.length} posts:\n\n${posts.map(post =>
                        `ID: ${post.id}\nUser ID: ${post.userId}\nTitle: ${post.title}\nBody: ${post.body.substring(0, 100)}...\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

server.registerTool("get-post",
    {
        title: "Get Post",
        description: "Get a specific post by ID",
        inputSchema: {
            id: z.number().min(1).describe("Post ID"),
        }
    },
    async ({ id }) => {
        const url = `${JSONPLACEHOLDER_API_BASE}/posts/${id}`;
        const post = await makeJSONPlaceholderRequest<Post>(url);

        if (!post) {
            return {
                content: [{ type: "text", text: `Failed to retrieve post with ID ${id}` }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Post ID: ${post.id}\nUser ID: ${post.userId}\nTitle: ${post.title}\nBody: ${post.body}`,
                },
            ],
        };
    }
);

server.registerTool("create-post",
    {
        title: "Create Post",
        description: "Create a new post",
        inputSchema: {
            userId: z.number().min(1).describe("User ID"),
            title: z.string().describe("Post title"),
            body: z.string().describe("Post body"),
        }
    },
    async ({ userId, title, body }) => {
        const url = `${JSONPLACEHOLDER_API_BASE}/posts`;
        const postData = { userId, title, body };

        const post = await makeJSONPlaceholderRequest<Post>(url, {
            method: "POST",
            body: JSON.stringify(postData),
        });

        if (!post) {
            return {
                content: [{ type: "text", text: "Failed to create post" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Post created successfully!\nID: ${post.id}\nUser ID: ${post.userId}\nTitle: ${post.title}\nBody: ${post.body}`,
                },
            ],
        };
    }
);

// Users tools
server.registerTool("get-users",
    {
        title: "Get Users",
        description: "Get all users",
        inputSchema: {}
    },
    async () => {
        const url = `${JSONPLACEHOLDER_API_BASE}/users`;
        const users = await makeJSONPlaceholderRequest<User[]>(url);

        if (!users) {
            return {
                content: [{ type: "text", text: "Failed to retrieve users" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${users.length} users:\n\n${users.map(user =>
                        `ID: ${user.id}\nName: ${user.name}\nUsername: ${user.username}\nEmail: ${user.email}\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

server.registerTool("get-user",
    {
        title: "Get User",
        description: "Get a specific user by ID",
        inputSchema: {
            id: z.number().min(1).describe("User ID"),
        }
    },
    async ({ id }) => {
        const url = `${JSONPLACEHOLDER_API_BASE}/users/${id}`;
        const user = await makeJSONPlaceholderRequest<User>(url);

        if (!user) {
            return {
                content: [{ type: "text", text: `Failed to retrieve user with ID ${id}` }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `User ID: ${user.id}\nName: ${user.name}\nUsername: ${user.username}\nEmail: ${user.email}\nPhone: ${user.phone || "N/A"}\nWebsite: ${user.website || "N/A"}\nCompany: ${user.company?.name || "N/A"}`,
                },
            ],
        };
    }
);

// Comments tools
server.registerTool("get-comments",
    {
        title: "Get Comments",
        description: "Get all comments or comments for a specific post",
        inputSchema: {
            postId: z.number().optional().describe("Filter comments by post ID"),
            limit: z.number().optional().describe("Limit number of results"),
        }
    },
    async ({ postId, limit }) => {
        let url = `${JSONPLACEHOLDER_API_BASE}/comments`;
        const params = new URLSearchParams();

        if (postId) params.append("postId", postId.toString());
        if (limit) params.append("_limit", limit.toString());

        if (params.toString()) url += `?${params.toString()}`;

        const comments = await makeJSONPlaceholderRequest<Comment[]>(url);

        if (!comments) {
            return {
                content: [{ type: "text", text: "Failed to retrieve comments" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${comments.length} comments:\n\n${comments.map(comment =>
                        `ID: ${comment.id}\nPost ID: ${comment.postId}\nName: ${comment.name}\nEmail: ${comment.email}\nBody: ${comment.body.substring(0, 100)}...\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

server.registerTool("get-post-comments",
    {
        title: "Get Post Comments",
        description: "Get all comments for a specific post",
        inputSchema: {
            postId: z.number().min(1).describe("Post ID"),
        }
    },
    async ({ postId }) => {
        const url = `${JSONPLACEHOLDER_API_BASE}/posts/${postId}/comments`;
        const comments = await makeJSONPlaceholderRequest<Comment[]>(url);

        if (!comments) {
            return {
                content: [{ type: "text", text: `Failed to retrieve comments for post ${postId}` }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${comments.length} comments for post ${postId}:\n\n${comments.map(comment =>
                        `ID: ${comment.id}\nName: ${comment.name}\nEmail: ${comment.email}\nBody: ${comment.body}\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

// Albums tools
server.registerTool("get-albums",
    {
        title: "Get Albums",
        description: "Get all albums or albums for a specific user",
        inputSchema: {
            userId: z.number().optional().describe("Filter albums by user ID"),
            limit: z.number().optional().describe("Limit number of results"),
        }
    },
    async ({ userId, limit }) => {
        let url = `${JSONPLACEHOLDER_API_BASE}/albums`;
        const params = new URLSearchParams();

        if (userId) params.append("userId", userId.toString());
        if (limit) params.append("_limit", limit.toString());

        if (params.toString()) url += `?${params.toString()}`;

        const albums = await makeJSONPlaceholderRequest<Album[]>(url);

        if (!albums) {
            return {
                content: [{ type: "text", text: "Failed to retrieve albums" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${albums.length} albums:\n\n${albums.map(album =>
                        `ID: ${album.id}\nUser ID: ${album.userId}\nTitle: ${album.title}\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

// Photos tools
server.registerTool("get-photos",
    {
        title: "Get Photos",
        description: "Get all photos or photos for a specific album",
        inputSchema: {
            albumId: z.number().optional().describe("Filter photos by album ID"),
            limit: z.number().optional().describe("Limit number of results"),
        }
    },
    async ({ albumId, limit }) => {
        let url = `${JSONPLACEHOLDER_API_BASE}/photos`;
        const params = new URLSearchParams();

        if (albumId) params.append("albumId", albumId.toString());
        if (limit) params.append("_limit", limit.toString());

        if (params.toString()) url += `?${params.toString()}`;

        const photos = await makeJSONPlaceholderRequest<Photo[]>(url);

        if (!photos) {
            return {
                content: [{ type: "text", text: "Failed to retrieve photos" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${photos.length} photos:\n\n${photos.map(photo =>
                        `ID: ${photo.id}\nAlbum ID: ${photo.albumId}\nTitle: ${photo.title}\nURL: ${photo.url}\nThumbnail: ${photo.thumbnailUrl}\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

// Todos tools
server.registerTool("get-todos",
    {
        title: "Get Todos",
        description: "Get all todos or todos for a specific user",
        inputSchema: {
            userId: z.number().optional().describe("Filter todos by user ID"),
            completed: z.boolean().optional().describe("Filter todos by completion status"),
            limit: z.number().optional().describe("Limit number of results"),
        }
    },
    async ({ userId, completed, limit }) => {
        let url = `${JSONPLACEHOLDER_API_BASE}/todos`;
        const params = new URLSearchParams();

        if (userId) params.append("userId", userId.toString());
        if (completed !== undefined) params.append("completed", completed.toString());
        if (limit) params.append("_limit", limit.toString());

        if (params.toString()) url += `?${params.toString()}`;

        const todos = await makeJSONPlaceholderRequest<Todo[]>(url);

        if (!todos) {
            return {
                content: [{ type: "text", text: "Failed to retrieve todos" }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Retrieved ${todos.length} todos:\n\n${todos.map(todo =>
                        `ID: ${todo.id}\nUser ID: ${todo.userId}\nTitle: ${todo.title}\nCompleted: ${todo.completed}\n---`
                    ).join("\n")}`,
                },
            ],
        };
    }
);

server.registerTool("get-todo",
    {
        title: "Get Todo",
        description: "Get a specific todo by ID",
        inputSchema: {
            id: z.number().min(1).describe("Todo ID"),
        }
    },
    async ({ id }) => {
        const url = `${JSONPLACEHOLDER_API_BASE}/todos/${id}`;
        const todo = await makeJSONPlaceholderRequest<Todo>(url);

        if (!todo) {
            return {
                content: [{ type: "text", text: `Failed to retrieve todo with ID ${id}` }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Todo ID: ${todo.id}\nUser ID: ${todo.userId}\nTitle: ${todo.title}\nCompleted: ${todo.completed}`,
                },
            ],
        };
    }
);

const activeTransports = new Map<string, StreamableHTTPServerTransport>();

async function main() {
    const app = express();
    const PORT = process.env.PORT || 3000;

    // Enable CORS
    app.use(
        cors({
            origin: '*',
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID']
        })
    );

    // Parse JSON bodies
    app.use(express.json());

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', server: 'jsonplaceholder-mcp' });
    });

    // Debug endpoint to check active transports
    app.get('/debug/transports', (_req: Request, res: Response) => {
        const activeSessions = Array.from(activeTransports.keys());
        res.json({
            activeSessions,
            count: activeTransports.size,
            timestamp: new Date().toISOString()
        });
    });

    // Main MCP endpoint - handles GET, POST, and DELETE
    app.route('/mcp')
        .all(async (req: Request, res: Response) => {
            console.log(`${req.method} /mcp, session: ${req.headers['mcp-session-id'] ? req.headers['mcp-session-id'] : 'No session'}`);

            // Get or create transport for this session
            let sessionId = req.headers['mcp-session-id'] as string;
            let transport = sessionId ? activeTransports.get(sessionId) : null;

            // For initialization requests or when no session exists, create new transport
            if (!transport) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableJsonResponse: false, // Use SSE by default
                    onsessioninitialized: async (newSessionId: string) => {
                        console.log(`Session initialized: ${newSessionId}`);
                        activeTransports.set(newSessionId, transport!);
                    },
                    onsessionclosed: async (closedSessionId: string) => {
                        console.log(`Session closed: ${closedSessionId}`);
                        activeTransports.delete(closedSessionId);
                    },
                    // Optional: Enable DNS rebinding protection
                    enableDnsRebindingProtection: false,
                    // Optional: Specify allowed hosts/origins if needed
                    // allowedHosts: ['localhost:3000', 'your-domain.com'],
                    // allowedOrigins: ['http://localhost:3000', 'https://your-domain.com']
                });


                // Connect the MCP server to the transport
                await server.connect(transport);

                console.log('New transport created and MCP server connected');
            }

            try {
                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error('Error handling request:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: "2.0",
                        error: {
                            code: -32000,
                            message: "Internal server error"
                        },
                        id: null
                    });
                }
            }
        });

    app.listen(PORT, () => {
        console.log(`JSONPlaceholder MCP Server v2.0 running at http://localhost:${PORT}`);
        console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`Debug endpoint: http://localhost:${PORT}/debug/transports`);
    });
}

main().catch(e => { console.error(e); process.exit(1); });