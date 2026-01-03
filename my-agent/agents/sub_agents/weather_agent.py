from langchain_ollama import ChatOllama
from deepagents import create_deep_agent
from typing import Dict, Any, Optional

from config import load_prompt, AGENT_CONFIG, API_CONFIG
from tools.research_tools import weather_research

import httpx

custom_client = httpx.Client(
    timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
)

class WeatherAgent:
    """Weather Agent for weather information gathering"""
    
    def __init__(self):
        config = AGENT_CONFIG["weather_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model
        self.model = ChatOllama(
            model=config["model"],
            temperature=config["temperature"],
            base_url=API_CONFIG["ollama_base_url"]
        )
        
        # Create agent with weather research tool
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt=self.prompt,
            tools=[weather_research]
        )
    
    def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the research agent
        
        Args:
            query: Research query
            context: Additional context
            
        Returns:
            Research results
        """
        messages = [{"role": "user", "content": query}]
        if context:
            messages.insert(0, {"role": "system", "content": f"Context: {context}"})
        
        result = self.agent.invoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
