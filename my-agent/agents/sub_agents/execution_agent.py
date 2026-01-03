"""
Execution Agent - Specialized in API calls and resource management
"""
from langchain_ollama import ChatOllama
from deepagents import create_deep_agent
from typing import Dict, Any, Optional

from config import load_prompt, AGENT_CONFIG, API_CONFIG
from tools.execution_tools import EXECUTION_TOOLS


class ExecutionAgent:
    """Execution Agent for performing actions and managing resources"""
    
    def __init__(self):
        config = AGENT_CONFIG["execution_agent"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model
        self.model = ChatOllama(
            model=config["model"],
            temperature=config["temperature"],
            base_url=API_CONFIG["ollama_base_url"]
        )
        
        # Create agent with execution tools
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt=self.prompt,
            tools=EXECUTION_TOOLS
        )
    
    def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the execution agent
        
        Args:
            query: Execution instruction
            context: Additional context or parameters
            
        Returns:
            Execution results
        """
        messages = [{"role": "user", "content": query}]
        if context:
            messages.insert(0, {"role": "system", "content": f"Context: {context}"})
        
        result = self.agent.invoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
