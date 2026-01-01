"""
Research Tools - Tools for information gathering and research
"""
import os
import requests
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

def weather_research(query: str) -> Dict[str, Any]:
    """
    Research weather information for a given location using OpenWeatherMap API
    
    Args:
        query: Location query (e.g., "Hanoi, Vietnam" or "weather in New York")
        
    Returns:
        Weather information including temperature, conditions, etc.
    """
    api_key = os.environ.get("OPENWEATHER_API_KEY")
    if not api_key:
        return {"error": "OPENWEATHER_API_KEY not set in environment variables"}
    
    # Extract city name from query (simple parsing)
    city = query.replace("weather in", "").replace("weather for", "").strip()
    if not city:
        return {"error": "No city specified in query"}
    
    try:
        # Step 1: Get geo coordinates
        geo_url = f"http://api.openweathermap.org/geo/1.0/direct?q={city}&limit=1&appid={api_key}"
        geo_response = requests.get(geo_url)
        geo_response.raise_for_status()
        geo_data = geo_response.json()
        
        if not geo_data:
            return {"error": f"City '{city}' not found"}
        
        lat = geo_data[0]['lat']
        lon = geo_data[0]['lon']
        city_name = geo_data[0]['name']
        country = geo_data[0].get('country', '')
        
        # Step 2: Get weather data
        weather_url = f"https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&exclude=minutely,hourly,daily,alerts&appid={api_key}&units=metric"
        weather_response = requests.get(weather_url)
        weather_response.raise_for_status()
        weather_data = weather_response.json()
        
        current = weather_data['current']
        temp = current['temp']
        feels_like = current['feels_like']
        humidity = current['humidity']
        wind_speed = current['wind_speed']
        weather_desc = current['weather'][0]['description']
        weather_main = current['weather'][0]['main']
        
        return {
            "location": f"{city_name}, {country}",
            "coordinates": {"lat": lat, "lon": lon},
            "temperature": temp,
            "feels_like": feels_like,
            "humidity": humidity,
            "wind_speed": wind_speed,
            "description": weather_desc,
            "main": weather_main,
            "units": "Celsius"
        }
        
    except requests.exceptions.RequestException as e:
        return {"error": f"API request failed: {str(e)}"}
    except KeyError as e:
        return {"error": f"Unexpected API response format: {str(e)}"}


# Export tools list
RESEARCH_TOOLS = [
    web_search,
    search_news,
    extract_key_information,
    summarize_research
]
