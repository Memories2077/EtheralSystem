from langchain_ollama import ChatOllama
from deepagents import create_deep_agent  # Nếu có

llm = ChatOllama(
    model="qwen2.5:14b",  # Nhỏ + tools tốt
    temperature=0.1,
    num_predict=200,           # Output ngắn
    num_ctx=2048,              # Context nhỏ
    base_url="https://ollama.timnguyen.id.vn"  # Bỏ nếu local
)

# Direct LLM call for simple test
result = llm.invoke("Introduce yourself")
print(result.content)