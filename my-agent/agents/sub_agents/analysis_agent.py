"""
Analysis Agent - Specialized in data analysis
"""
from langchain_ollama import ChatOllama
from deepagents import create_deep_agent
from typing import Dict, Any, Optional

from config import load_prompt, AGENT_CONFIG
from tools.analysis_tools import ANALYSIS_TOOLS


class AnalysisAgent:
    """Analysis Agent for data analysis and reporting"""
    
    def __init__(self):
        config = AGENT_CONFIG["analysis_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model
        self.model = ChatOllama(
            model=config["model"],
            temperature=config["temperature"]
        )
        
        # Create agent with analysis tools
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt=self.prompt,
            tools=ANALYSIS_TOOLS
        )
    
    def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the analysis agent
        
        Args:
            query: Analysis query
            context: Additional context or data to analyze
            
        Returns:
            Analysis results
        """
        messages = [{"role": "user", "content": query}]
        if context:
            messages.insert(0, {"role": "system", "content": f"Context: {context}"})
        
        result = self.agent.invoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
