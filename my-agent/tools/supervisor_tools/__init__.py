"""
Supervisor Tools - Tools for task delegation and coordination
"""
from typing import Dict, Any, Literal, Optional


def delegate_to_agent(
    agent_name: Literal["research_agent", "analysis_agent", "execution_agent", "weather_agent", "social_agent"],
    task_description: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Delegate a task to a specific sub-agent
    
    Args:
        agent_name: Name of the agent to delegate to
        task_description: Clear description of the task
        context: Additional context or data for the agent
        
    Returns:
        Information about the delegation (will be handled by orchestrator)
    """
    return {
        "action": "delegate",
        "agent": agent_name,
        "task": task_description,
        "context": context or {},
        "status": "delegated"
    }


def get_agent_status(agent_name: str) -> Dict[str, Any]:
    """
    Get the current status of a sub-agent
    
    Args:
        agent_name: Name of the agent
        
    Returns:
        Status information about the agent
    """
    return {
        "agent": agent_name,
        "status": "available",
        "last_task": None
    }


def synthesize_results(results: Dict[str, Any]) -> str:
    """
    Synthesize results from multiple agents into a coherent response
    
    Args:
        results: Dictionary of results from different agents
        
    Returns:
        Synthesized summary
    """
    synthesis = []
    
    for agent, result in results.items():
        if result:
            synthesis.append(f"From {agent}:\n{result}")
    
    return "\n\n".join(synthesis)


# Export tools list
SUPERVISOR_TOOLS = [
    delegate_to_agent,
    get_agent_status,
    synthesize_results
]
