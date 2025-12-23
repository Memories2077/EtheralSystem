"""
Execution Tools - Tools for API calls and resource management
"""
import os
import requests
from typing import Dict, Any, Optional, Literal


# MCP Server Configuration
MCP_BASE_URL = os.getenv("MCP_BASE_URL", "http://localhost:8000")
MCP_API_KEY = os.getenv("MCP_API_KEY", "")


class MCPClient:
    """Client for MCP Server API calls"""
    
    def __init__(self):
        self.base_url = MCP_BASE_URL.rstrip('/')
        self.api_key = MCP_API_KEY
        self.session = requests.Session()
        
        if self.api_key:
            self.session.headers.update({
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            })
    
    def request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to MCP Server"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                params=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e), "status": "failed"}


# Initialize MCP client
mcp_client = MCPClient()


def create_resource(
    resource_type: str,
    name: str,
    data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Create a new resource in the MCP Server
    
    Args:
        resource_type: Type of resource to create
        name: Name of the resource
        data: Resource data
        
    Returns:
        Created resource information
    """
    return mcp_client.request(
        method="POST",
        endpoint=f"/api/{resource_type}",
        data={"name": name, "data": data}
    )


def get_resource(
    resource_type: str,
    resource_id: str
) -> Dict[str, Any]:
    """
    Retrieve a resource from the MCP Server
    
    Args:
        resource_type: Type of resource
        resource_id: ID of the resource
        
    Returns:
        Resource data
    """
    return mcp_client.request(
        method="GET",
        endpoint=f"/api/{resource_type}/{resource_id}"
    )


def update_resource(
    resource_type: str,
    resource_id: str,
    data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Update an existing resource
    
    Args:
        resource_type: Type of resource
        resource_id: ID of the resource
        data: Updated data
        
    Returns:
        Updated resource information
    """
    return mcp_client.request(
        method="PUT",
        endpoint=f"/api/{resource_type}/{resource_id}",
        data=data
    )


def delete_resource(
    resource_type: str,
    resource_id: str
) -> Dict[str, Any]:
    """
    Delete a resource from the MCP Server
    
    Args:
        resource_type: Type of resource
        resource_id: ID of the resource
        
    Returns:
        Deletion confirmation
    """
    return mcp_client.request(
        method="DELETE",
        endpoint=f"/api/{resource_type}/{resource_id}"
    )


def list_resources(
    resource_type: str,
    page: int = 1,
    per_page: int = 20,
    filters: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    List resources from the MCP Server
    
    Args:
        resource_type: Type of resources to list
        page: Page number
        per_page: Items per page
        filters: Optional filters
        
    Returns:
        List of resources
    """
    params = {"page": page, "per_page": per_page}
    if filters:
        params.update(filters)
    
    return mcp_client.request(
        method="GET",
        endpoint=f"/api/{resource_type}",
        params=params
    )


def search_resources(
    resource_type: str,
    query: str,
    max_results: int = 10
) -> Dict[str, Any]:
    """
    Search for resources in the MCP Server
    
    Args:
        resource_type: Type of resources to search
        query: Search query
        max_results: Maximum number of results
        
    Returns:
        Search results
    """
    return mcp_client.request(
        method="GET",
        endpoint=f"/api/{resource_type}/search",
        params={"q": query, "limit": max_results}
    )


def execute_api_call(
    url: str,
    method: Literal["GET", "POST", "PUT", "DELETE"] = "GET",
    headers: Optional[Dict] = None,
    data: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Execute a custom API call
    
    Args:
        url: API endpoint URL
        method: HTTP method
        headers: Optional headers
        data: Optional request body
        
    Returns:
        API response
    """
    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=data,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "status": "failed"}


# Export tools list
EXECUTION_TOOLS = [
    create_resource,
    get_resource,
    update_resource,
    delete_resource,
    list_resources,
    search_resources,
    execute_api_call
]
