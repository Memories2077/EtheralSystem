"""
Agent Configuration and Utilities
"""
import os
from pathlib import Path


# Base directory
BASE_DIR = Path(__file__).parent.parent
PROMPTS_DIR = BASE_DIR / "prompts"


def load_prompt(prompt_file: str) -> str:
    """Load prompt from file"""
    prompt_path = PROMPTS_DIR / prompt_file
    if prompt_path.exists():
        return prompt_path.read_text(encoding='utf-8')
    return ""


def get_env_var(key: str, default: str = "") -> str:
    """Get environment variable with default"""
    return os.getenv(key, default)


# Agent configuration
AGENT_CONFIG = {
    "supervisor": {
        "name": "Supervisor Agent",
        "prompt_file": "supervisor_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.7,
    },
    "research_agent": {
        "name": "Research Agent",
        "prompt_file": "research_agent_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.5,
    },
    "analysis_agent": {
        "name": "Analysis Agent",
        "prompt_file": "analysis_agent_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.3,
    },
    "execution_agent": {
        "name": "Execution Agent",
        "prompt_file": "execution_agent_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.2,
    },
    "weather_agent": {
        "name": "Weather Agent",
        "prompt_file": "weather_agent_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.3,
    },
    "social_agent": {
        "name": "Social Agent",
        "prompt_file": "social_agent_prompt.txt",
        "model": "deepseek-r1:14b",
        "temperature": 0.3,
    }}


# API Configuration
API_CONFIG = {
    "google_api_key": get_env_var("GOOGLE_API_KEY"),
    "tavily_api_key": get_env_var("TAVILY_API_KEY"),
    "mcp_base_url": get_env_var("MCP_BASE_URL", "http://localhost:8000"),
    "mcp_api_key": get_env_var("MCP_API_KEY"),
    "ollama_base_url": get_env_var("OLLAMA_BASE_URL", "https://ollama.timnguyen.id.vn/")
}
