"""
Agent Configuration and Utilities
"""
import os
from pathlib import Path
from dotenv import load_dotenv

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
    load_dotenv()

    return os.getenv(key, default)


# Agent configuration
AGENT_CONFIG = {
    "supervisor": {
        "name": "Supervisor Agent",
        "prompt_file": "supervisor.txt",
        "model": get_env_var("GEMINI_MODEL", "gemini-2.5-flash"),
        "temperature": 0.5,
    },
    "generator_agent": {
        "name": "Generator Agent",
        "prompt_file": "generator.txt",
        "model": get_env_var("GEMINI_MODEL", "gemini-2.5-flash"),
        "temperature": 0.3,
    },
    "examiner_agent": {
        "name": "Examiner Agent",
        "prompt_file": "examiner.txt",
        "model": get_env_var("GEMINI_MODEL", "gemini-2.5-flash"),
        "temperature": 0.3
    }}

# API Configuration
API_CONFIG = {
    "gemini_api_key": get_env_var("GEMINI_API_KEY"),
    "groq_api_key": get_env_var("GROQ_API_KEY"),
    "metaclaw_api_key": get_env_var("METACLAW_API_KEY", "metaclaw"),
    "metaclaw_base_url": get_env_var("METACLAW_BASE_URL", "http://host.docker.internal:30000/v1"),
    "tavily_api_key": get_env_var("TAVILY_API_KEY"),
    "mcp_base_url": get_env_var("MCP_BASE_URL", "http://docker-manager:8080/api"),
    "mcp_api_key": get_env_var("MCP_API_KEY"),
    "mongo_uri": get_env_var("MONGO_URI", "mongodb://mongodb:27017"),
    "mongo_db_name": get_env_var("MONGO_DB_NAME", "mcp_agent_db"),
}

# LLM Provider Configuration
PROVIDER_CONFIG = {
    "gemini": get_env_var("GEMINI_MODEL"),
    "groq": get_env_var("GROQ_MODEL"),
    "metaclaw": get_env_var("METACLAW_MODEL", "gemini-2.5-flash") # Use standard model name for metaclaw
}

