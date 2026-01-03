"""
Research Agent - Specialized in information gathering
"""
from langchain_ollama import ChatOllama
from deepagents import create_deep_agent
from typing import Dict, Any, Optional

from config import load_prompt, AGENT_CONFIG, API_CONFIG
from tools.research_tools import RESEARCH_TOOLS


class ResearchAgent:
    """Research Agent for information gathering"""
    
    def __init__(self):
        config = AGENT_CONFIG["research_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model
        self.model = ChatOllama(
            model=config["model"],
            temperature=config["temperature"],
            base_url=API_CONFIG["ollama_base_url"]
        )
        
        # Create agent with research tools
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt=self.prompt,
            tools=RESEARCH_TOOLS
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
