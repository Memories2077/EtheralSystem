"""
Supervisor Agent - Coordinates and delegates tasks to sub-agents
"""
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, BaseMessage
from langchain.agents import create_agent
from typing import Dict, Any, Optional, List
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
        
        # Create agent with langgraph
        self.agent = create_agent(
            model=self.model,
            tools=SUPERVISOR_TOOLS,
            prompt=self.prompt
        )
    
    async def invoke(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoke the supervisor agent
        
        Args:
            query: User query
            context: Additional context
            
        Returns:
            Agent response
        """
        # Combine context with query to avoid SystemMessage at start (template issues)
        if context:
            combined_query = f"[Context: {context}]\n\n{query}"
        else:
            combined_query = query
        
        messages: List[BaseMessage] = [HumanMessage(content=combined_query)]
        
        result = await self.agent.ainvoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
