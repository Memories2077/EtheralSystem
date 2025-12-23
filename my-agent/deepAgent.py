from langchain_google_genai import ChatGoogleGenerativeAI
from deepagents import create_deep_agent
import os
from typing import Literal
from tavily import TavilyClient

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])

model = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
):
    """Run a web search"""
    return tavily_client.search(
        query,
        max_results=max_results,
        topic=topic,
    )

research_instructions = """\
You are an expert researcher. Your job is to conduct \
thorough research, and then write a polished report. \
"""

agent = create_deep_agent(
    model=model,
    system_prompt=research_instructions,
    tools=[internet_search]
)

if __name__ == "__main__":
    # Example query to test the agent
    query = "Research the latest developments in AI agents in 2025"
    print(f"\n{'='*60}")
    print(f"QUERY: {query}")
    print(f"{'='*60}\n")
    
    result = agent.invoke({"messages": [{"role": "user", "content": query}]})
    
    print(f"\n{'='*60}")
    print("RESEARCH RESULT")
    print(f"{'='*60}\n")
    
    # Extract and format the messages
    if "messages" in result:
        for i, message in enumerate(result["messages"], 1):
            # Handle LangChain message objects
            role = message.__class__.__name__.replace("Message", "").upper()
            content = message.content if hasattr(message, 'content') else str(message)
            
            # If content is a list (structured output), extract text
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        text_parts.append(item['text'])
                    elif isinstance(item, dict) and 'type' in item:
                        text_parts.append(str(item))
                    else:
                        text_parts.append(str(item))
                content = '\n'.join(text_parts)
            
            print(f"\n--- Message {i} ({role}) ---")
            print(content)
            print()
    else:
        print(result)
    
    print(f"\n{'='*60}")