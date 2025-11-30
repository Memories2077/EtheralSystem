import sys
import time
import traceback
from typing_extensions import TypedDict
from typing import cast


def print_diagnostics():
    print("Python executable:", sys.executable)
    print("Python version:", sys.version.replace('\n', ' '))
    try:
        import site

        print("User site-packages:", site.getusersitepackages())
    except Exception:
        pass
    print("sys.path (first 6 entries):")
    for p in sys.path[:6]:
        print(" -", p)


class State(TypedDict):
    topic: str
    joke: str
    improved_joke: str
    final_joke: str


def main():
    print_diagnostics()

    # Defer heavy imports so the script can print diagnostics first.
    try:
        t0 = time.time()
        from langgraph.graph import StateGraph, START, END
        from IPython.display import Image, display
        from langchain_google_genai import ChatGoogleGenerativeAI
        t1 = time.time()
        print(f"Imported heavy modules in {t1-t0:.2f}s")
    except Exception as e:
        print("Error importing langgraph/langchain stack:")
        traceback.print_exc()
        print()
        print(
            "Possible causes: using the wrong Python interpreter (not the project's venv),"
        )
        print(
            "or a corrupted/slow package metadata entry. Try:\n  - Activate the project's venv and run:\n    .\\.venv\\Scripts\\Activate.ps1; python -m pip install --upgrade --force-reinstall pydantic langgraph langchain-core"
        )
        sys.exit(1)

    # Initialize LLM
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

    # Nodes
    def generate_joke(state: State):
        msg = llm.invoke(f"Write a short joke about {state['topic']}")
        return {"joke": msg.content}

    def check_punchline(state: State):
        if "?" in state["joke"] or "!" in state["joke"]:
            return "Pass"
        return "Fail"

    def improve_joke(state: State):
        msg = llm.invoke(f"Make this joke funnier by adding wordplay: {state['joke']}")
        return {"improved_joke": msg.content}

    def polish_joke(state: State):
        msg = llm.invoke(f"Add a surprising twist to this joke: {state['improved_joke']}")
        return {"final_joke": msg.content}

    # Build workflow
    workflow = StateGraph(State)
    workflow.add_node("generate_joke", generate_joke)
    workflow.add_node("improve_joke", improve_joke)
    workflow.add_node("polish_joke", polish_joke)

    # Add edges to connect nodes
    workflow.add_edge(START, "generate_joke")
    workflow.add_conditional_edges(
        "generate_joke", check_punchline, {"Fail": "improve_joke", "Pass": END}
    )
    workflow.add_edge("improve_joke", "polish_joke")
    workflow.add_edge("polish_joke", END)

    # Compile
    chain = workflow.compile()

    # Show workflow (optional; will require IPython display availability)
    try:
        display(Image(chain.get_graph().draw_mermaid_png()))
    except Exception:
        pass

    state = chain.invoke(cast(State, {"topic": "cats"}))
    print("Initial joke:")
    print(state["joke"])
    print("\n--- --- ---\n")
    if "improved_joke" in state:
        print("Improved joke:")
        print(state["improved_joke"])
        print("\n--- --- ---\n")

        print("Final joke:")
        print(state["final_joke"])
    else:
        print("Final joke:")
        print(state["joke"])


if __name__ == "__main__":
    main()