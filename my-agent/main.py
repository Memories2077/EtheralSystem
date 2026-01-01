"""
Multi-Agent System - Main Entry Point
Supervisor Agent coordinates Research, Analysis, and Execution agents
"""
import os
import sys
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents import SupervisorAgent, ResearchAgent, AnalysisAgent, ExecutionAgent, WeatherAgent, SocialAgent


class MultiAgentSystem:
    """Multi-Agent System with Supervisor and Sub-Agents"""
    
    def __init__(self):
        print("Initializing Multi-Agent System...")
        
        # Initialize all agents
        self.supervisor = SupervisorAgent()
        self.research_agent = ResearchAgent()
        self.analysis_agent = AnalysisAgent()
        self.execution_agent = ExecutionAgent()
        self.weather_agent = WeatherAgent()
        self.social_agent = SocialAgent()
        
        print(f"✓ {self.supervisor}")
        print(f"✓ {self.research_agent}")
        print(f"✓ {self.analysis_agent}")
        print(f"✓ {self.execution_agent}")
        print(f"✓ {self.weather_agent}")
        print(f"✓ {self.social_agent}")
        print("\nMulti-Agent System Ready!\n")
    
    def run(self, query: str, agent_type: str = "supervisor") -> str:
        """
        Run a query through the specified agent
        
        Args:
            query: User query
            agent_type: Which agent to use (supervisor, research, analysis, execution)
            
        Returns:
            Formatted response
        """
        print(f"{'='*60}")
        print(f"Agent: {agent_type.upper()}")
        print(f"Query: {query}")
        print(f"{'='*60}\n")
        
        # Select agent
        agent_map = {
            "supervisor": self.supervisor,
            "weather": self.weather_agent,
            "social": self.social_agent
        }
        
        agent = agent_map.get(agent_type.lower(), self.supervisor)
        
        # Invoke agent
        result = agent.invoke(query)
        
        # Extract and format response
        response = self._format_response(result)
        
        print("RESPONSE:")
        print(response)
        print(f"\n{'='*60}\n")
        
        return response
    
    def _format_response(self, result: Dict[str, Any]) -> str:
        """Format agent response for display"""
        if "messages" in result:
            last_message = result["messages"][-1]
            content = last_message.content if hasattr(last_message, 'content') else str(last_message)
            
            # Extract text from structured content
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        text_parts.append(item['text'])
                    else:
                        text_parts.append(str(item))
                content = '\n'.join(text_parts)
            
            return content
        
        return str(result)
    
    def interactive_mode(self):
        """Run in interactive mode"""
        print("\n" + "="*60)
        print("INTERACTIVE MODE")
        print("="*60)
        print("Commands:")
        print("  - Type your query to use Supervisor Agent")
        print("  - Use 'research: <query>' for Research Agent")
        print("  - Use 'analysis: <query>' for Analysis Agent")
        print("  - Use 'execution: <query>' for Execution Agent")
        print("  - Use 'weather: <query>' for Weather Agent")
        print("  - Use 'social: <query>' for Social Agent")
        print("  - Type 'exit' or 'quit' to exit")
        print("="*60 + "\n")
        
        while True:
            try:
                user_input = input("You: ").strip()
                
                if not user_input:
                    continue
                
                if user_input.lower() in ['exit', 'quit', 'q']:
                    print("\nGoodbye!")
                    break
                
                # Parse agent type and query
                if ':' in user_input and user_input.split(':')[0].lower() in ['research', 'analysis', 'execution', 'weather', 'social']:
                    agent_type, query = user_input.split(':', 1)
                    agent_type = agent_type.strip().lower()
                    query = query.strip()
                else:
                    agent_type = 'supervisor'
                    query = user_input
                
                # Run query
                self.run(query, agent_type)
                
            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}\n")


def main():
    """Main function"""
    # Initialize system
    system = MultiAgentSystem()
    
    # Test query for supervisor delegation
    test_query = ("supervisor", "Check the weather in Hanoi and post about it on social media")
    
    print("Running test query for supervisor delegation...\n")
    try:
        system.run(test_query[1], test_query[0])
    except Exception as e:
        print(f"Error: {e}\n")
    
    # Uncomment the line below to enable interactive mode
    # system.interactive_mode()


if __name__ == "__main__":
    main()
