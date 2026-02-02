"""
Test script to verify chat template compatibility
"""
import asyncio
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from pydantic import SecretStr
import os
from dotenv import load_dotenv

load_dotenv()

async def test_simple_call():
    """Test a simple LLM call without SystemMessage"""
    
    print("Testing LLM call without SystemMessage...")
    
    llm = ChatOpenAI(
        model=os.getenv("MODEL_NAME", "mistralai/Mistral-Nemo-Instruct-2407"),
        temperature=0.0,
        base_url=os.getenv("OPENAI_BASE_URL", "https://llmapi.iec-uit.com/v1"),
        api_key=SecretStr(os.getenv("OPENAI_API_KEY", "<API_KEY>"))
    )
    
    try:
        # Test with only HumanMessage
        response = await llm.ainvoke([
            HumanMessage(content="Say hello in one sentence.")
        ])
        
        print("✅ Success!")
        print(f"Response: {response.content}")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

async def test_combined_prompt():
    """Test with system instruction combined in user message"""
    
    print("\nTesting with combined system + user prompt...")
    
    llm = ChatOpenAI(
        model=os.getenv("MODEL_NAME", "mistralai/Mistral-Nemo-Instruct-2407"),
        temperature=0.0,
        base_url=os.getenv("OPENAI_BASE_URL", "https://llmapi.iec-uit.com/v1"),
        api_key=SecretStr(os.getenv("OPENAI_API_KEY", "<API_KEY>"))
    )
    
    try:
        # Combine system instruction with user message
        combined_prompt = """[SYSTEM INSTRUCTION]
You are a helpful assistant. Be concise.

[USER REQUEST]
Explain what is Python in one sentence."""
        
        response = await llm.ainvoke([
            HumanMessage(content=combined_prompt)
        ])
        
        print("✅ Success!")
        print(f"Response: {response.content}")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

async def main():
    print("="*60)
    print("Chat Template Compatibility Test")
    print("="*60)
    
    result1 = await test_simple_call()
    result2 = await test_combined_prompt()
    
    print("\n" + "="*60)
    if result1 and result2:
        print("✅ All tests passed! Chat template is working correctly.")
    else:
        print("❌ Some tests failed. Check the error messages above.")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(main())
