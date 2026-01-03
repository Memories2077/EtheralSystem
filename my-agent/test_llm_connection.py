"""
Simple LLM Connection Test
"""
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage
import time

print("Testing LLM Connection...")
print("=" * 60)

# Initialize LLM
print("\n1. Initializing ChatOllama...")
llm = ChatOllama(
    model="qwen2.5:7b",
    temperature=0.1,
    base_url="https://ollama.timnguyen.id.vn"
)
print("✓ ChatOllama initialized")

# Test simple message
print("\n2. Sending simple test message...")
print("Query: 'Hello, what is 2+2?'")

start_time = time.time()
try:
    response = llm.invoke([HumanMessage(content="Hello, what is 2+2?")])
    elapsed = time.time() - start_time
    
    print(f"\n✓ Response received in {elapsed:.2f} seconds")
    print(f"\nResponse content:")
    print("-" * 60)
    print(response.content)
    print("-" * 60)
    
except Exception as e:
    elapsed = time.time() - start_time
    print(f"\n❌ Error after {elapsed:.2f} seconds: {e}")
    print(f"Error type: {type(e).__name__}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Test completed")
