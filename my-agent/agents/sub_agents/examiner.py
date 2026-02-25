import asyncio
import os
from langchain_openai import ChatOpenAI
from mcp_use.client import MCPClient
from mcp_use.agents.adapters.langchain_adapter import LangChainAdapter
from dotenv import load_dotenv

# Import thêm cái này để tạo Agent tự động chạy loop
from langchain.agents import create_agent

load_dotenv()

async def main():
    # Initialize MCP client
    client = MCPClient.from_config_file("my-agent/tools/examiner_tools/mcp_config.json")

    llm = ChatOpenAI(
        model="iec-model",
        temperature=0.5,
        base_url=os.getenv("OPENAI_BASE_URL"),
        api_key=os.getenv("OPENAI_API_KEY"),
        streaming=True
    )

    # Create adapter instance
    adapter = LangChainAdapter()

    # Get LangChain tools
    tools = await adapter.create_tools(client)

    # --- PHẦN SỬA ĐỔI ---
    
    # Thay vì chỉ bind_tools, chúng ta tạo một Agent
    # Agent này sẽ tự động: Gọi LLM -> Nhận Tool Call -> Thực thi Tool -> Gửi kết quả lại cho LLM
    agent_executor = create_agent(llm, tools)

    # Gọi Agent thay vì gọi trực tiếp LLM
    # Lưu ý format input của LangGraph thường là list messages
    print("--- Bắt đầu hỏi Agent ---")
    inputs = {"messages": [("user", "What tools do you have available?")]}
    
    # Dùng astream để thấy quá trình (hoặc ainvoke để lấy kết quả cuối)
    async for chunk in agent_executor.astream(inputs, stream_mode="values"):
        # In ra message cuối cùng nhận được trong luồng
        message = chunk["messages"][-1]
        message.pretty_print()

if __name__ == "__main__":
    asyncio.run(main())