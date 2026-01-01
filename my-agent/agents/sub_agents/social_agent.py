from langchain_ollama import ChatOllama
from deepagents import create_deep_agent
from typing import Dict, Any, Optional

from config import load_prompt, AGENT_CONFIG
from tools.research_tools import RESEARCH_TOOLS


class SocialAgent:
    """Social Agent for social information gathering"""
    
    def __init__(self):
        config = AGENT_CONFIG["social_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model
        self.model = ChatOllama(
            model=config["model"],
            temperature=config["temperature"]
        )
        
        # Create agent with research tools
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt=self.prompt,
            tools=RESEARCH_TOOLS
        )
    
    def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the social agent
        
        Args:
            query: Social query
            context: Additional context
            
        Returns:
            Social results
        """
        messages = [{"role": "user", "content": query}]
        if context:
            messages.insert(0, {"role": "system", "content": f"Context: {context}"})
        
        result = self.agent.invoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
