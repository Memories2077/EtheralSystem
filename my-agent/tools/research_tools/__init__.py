"""
Research Tools - Tools for information gathering and research
"""
import os
from typing import Literal, Dict, Any, List, Optional
from tavily import TavilyClient

# Initialize Tavily client
tavily_client = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY", ""))


def web_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False
) -> Dict[str, Any]:
    """
    Perform a web search using Tavily
    
    Args:
        query: Search query
        max_results: Maximum number of results to return
        topic: Topic category for the search
        include_raw_content: Whether to include full content
        
    Returns:
        Search results with URLs, titles, and snippets
    """
    try:
        results = tavily_client.search(
            query=query,
            max_results=max_results,
            topic=topic,
            include_raw_content=include_raw_content
        )
        return results
    except Exception as e:
        return {"error": str(e), "results": []}


def search_news(
    query: str,
    max_results: int = 5,
    days_back: int = 7
) -> Dict[str, Any]:
    """
    Search for recent news articles
    
    Args:
        query: Search query
        max_results: Maximum number of results
        days_back: How many days back to search
        
    Returns:
        Recent news articles related to the query
    """
    try:
        results = tavily_client.search(
            query=query,
            max_results=max_results,
            topic="news",
            days=days_back
        )
        return results
    except Exception as e:
        return {"error": str(e), "results": []}


def extract_key_information(text: str, focus_areas: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extract key information from text based on focus areas
    
    Args:
        text: Text to analyze
        focus_areas: Specific areas to focus on (e.g., ["statistics", "dates", "names"])
        
    Returns:
        Extracted information organized by category
    """
    # Simple extraction logic (can be enhanced with NLP)
    extracted = {
        "length": len(text),
        "word_count": len(text.split()),
        "focus_areas": focus_areas or [],
        "preview": text[:200] + "..." if len(text) > 200 else text
    }
    
    return extracted


def summarize_research(findings: List[str]) -> str:
    """
    Summarize multiple research findings
    
    Args:
        findings: List of research findings to summarize
        
    Returns:
        Consolidated summary
    """
    if not findings:
        return "No findings to summarize."
    
    summary = f"Research Summary ({len(findings)} findings):\n\n"
    for i, finding in enumerate(findings, 1):
        summary += f"{i}. {finding}\n"
    
    return summary


# Export tools list
RESEARCH_TOOLS = [
    web_search,
    search_news,
    extract_key_information,
    summarize_research
]
