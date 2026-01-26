"""
Supervisor Agent - Coordinates and delegates tasks to sub-agents
"""
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langgraph.prebuilt import create_react_agent
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
        
        # Initialize model
        self.model = ChatOpenAI(
            model=config["model"],
            temperature=config["temperature"],
            base_url=API_CONFIG["openai_base_url"],
            api_key=SecretStr(str(API_CONFIG["openai_api_key"]))
        )
        
        # Create agent with langgraph
        self.agent = create_react_agent(
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
        messages: List[BaseMessage] = []
        if context:
            messages.append(SystemMessage(content=f"Context: {context}"))
        messages.append(HumanMessage(content=query))
        
        result = await self.agent.ainvoke({"messages": messages})
        return result
    
    def __repr__(self):
        return f"<{self.name}>"
