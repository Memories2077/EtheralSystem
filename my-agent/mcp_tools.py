"""
MCP Server Tools - Định nghĩa các tools để gọi RESTful API endpoints
"""
import os
import requests
from typing import Optional, Dict, Any, List


# Cấu hình MCP Server
MCP_BASE_URL = os.getenv("MCP_BASE_URL", "http://localhost:8000")
MCP_API_KEY = os.getenv("MCP_API_KEY", "")


class MCPClient:
    """Client để gọi MCP Server API"""
    
    def __init__(self, base_url: str = MCP_BASE_URL, api_key: str = MCP_API_KEY):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        
        # Thêm authentication headers nếu có
        if self.api_key:
            self.session.headers.update({
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            })
    
    def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Gọi API endpoint"""
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


# Khởi tạo client
mcp_client = MCPClient()


# ============================================
# ĐỊNH NGHĨA CÁC TOOLS
# ============================================

def mcp_get_data(resource_id: str) -> Dict[str, Any]:
    """
    Lấy dữ liệu từ MCP Server theo resource ID
    
    Args:
        resource_id: ID của resource cần lấy
        
    Returns:
        Dict chứa dữ liệu resource
    """
    return mcp_client._make_request(
        method="GET",
        endpoint=f"/api/resources/{resource_id}"
    )


def mcp_search(query: str, limit: int = 10) -> Dict[str, Any]:
    """
    Tìm kiếm dữ liệu trong MCP Server
    
    Args:
        query: Từ khóa tìm kiếm
        limit: Số lượng kết quả tối đa
        
    Returns:
        Dict chứa kết quả tìm kiếm
    """
    return mcp_client._make_request(
        method="GET",
        endpoint="/api/search",
        params={"q": query, "limit": limit}
    )


def mcp_create_resource(name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Tạo resource mới trong MCP Server
    
    Args:
        name: Tên của resource
        data: Dữ liệu của resource
        
    Returns:
        Dict chứa thông tin resource đã tạo
    """
    return mcp_client._make_request(
        method="POST",
        endpoint="/api/resources",
        data={"name": name, "data": data}
    )


def mcp_update_resource(resource_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Cập nhật resource trong MCP Server
    
    Args:
        resource_id: ID của resource cần cập nhật
        data: Dữ liệu mới
        
    Returns:
        Dict chứa thông tin resource đã cập nhật
    """
    return mcp_client._make_request(
        method="PUT",
        endpoint=f"/api/resources/{resource_id}",
        data=data
    )


def mcp_delete_resource(resource_id: str) -> Dict[str, Any]:
    """
    Xóa resource từ MCP Server
    
    Args:
        resource_id: ID của resource cần xóa
        
    Returns:
        Dict chứa kết quả xóa
    """
    return mcp_client._make_request(
        method="DELETE",
        endpoint=f"/api/resources/{resource_id}"
    )


def mcp_list_resources(page: int = 1, per_page: int = 20) -> Dict[str, Any]:
    """
    Liệt kê tất cả resources từ MCP Server
    
    Args:
        page: Số trang
        per_page: Số items mỗi trang
        
    Returns:
        Dict chứa danh sách resources
    """
    return mcp_client._make_request(
        method="GET",
        endpoint="/api/resources",
        params={"page": page, "per_page": per_page}
    )


# ============================================
# DANH SÁCH TOOLS CHO AGENT
# ============================================

# Danh sách tất cả các tools để truyền vào agent
MCP_TOOLS = [
    mcp_get_data,
    mcp_search,
    mcp_create_resource,
    mcp_update_resource,
    mcp_delete_resource,
    mcp_list_resources
]
