"""
Supervisor Agent - Coordinates and delegates tasks to sub-agents
"""
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, BaseMessage
from typing import Dict, Any, Optional
from pydantic import SecretStr

from config import load_prompt, AGENT_CONFIG, API_CONFIG
from tools.supervisor_tools import SUPERVISOR_TOOLS


class SupervisorAgent:
    """Supervisor Agent for task coordination"""
    
    def __init__(self):
        config = AGENT_CONFIG["supervisor"]
        self.name = config["name"]
        self.prompt = load_prompt(config["prompt_file"])
        
        # Initialize model (streaming=False to avoid 'Invalid diff' error with tool calls)
        api_key = SecretStr(API_CONFIG["gemini_api_key"])
        self.model = ChatGoogleGenerativeAI(model=config["model"], api_key=api_key)
        
        # Bind tools to the model
        self.model_with_tools = self.model.bind_tools(SUPERVISOR_TOOLS)
    
    async def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the supervisor agent
        
        Args:
            query: User query
            context: Additional context
            
        Returns:
            Agent response
        """
        # Combine prompt with query
        if context:
            combined_query = f"{self.prompt}\n\n[Context: {context}]\n\n{query}"
        else:
            combined_query = f"{self.prompt}\n\n{query}"
        
        messages = [HumanMessage(content=combined_query)]
        
        # Invoke model with tools
        response = await self.model_with_tools.ainvoke(messages)
        
        return {
            "messages": messages + [response],
            "final_response": str(response.content) if hasattr(response, 'content') else str(response)
        }
    
    def __repr__(self):
        return f"<{self.name}>"
