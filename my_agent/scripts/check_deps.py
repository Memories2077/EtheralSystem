import importlib
import sys

dependencies = [
    "langchain",
    "langgraph",
    "langchain_openai",
    "langchain_google_genai",
    "langchain_groq",
    "langchain_ollama",
    "chromadb",
    "llama_index",
    "pymongo",
    "dotenv",
    "httpx",
    "requests",
    "pydantic"
]

missing = []
for dep in dependencies:
    try:
        importlib.import_module(dep.replace("-", "_"))
        print(f"✅ {dep} is installed")
    except ImportError:
        print(f"❌ {dep} is NOT installed")
        missing.append(dep)

if missing:
    print(f"\nMissing dependencies: {', '.join(missing)}")
    sys.exit(1)
else:
    print("\nAll core dependencies are installed!")
    sys.exit(0)
