"""
Multi-Agent Graph - Phase 2: Dynamic Orchestrator
==================================================
Thay thế luồng cứng (Supervisor → Tools → Generator → END) bằng:
  - LLM-based decision routing: Supervisor dùng LLM quyết định next step
  - Iteration loop: sau mỗi sub-agent, Supervisor có thể re-evaluate
  - State tracking: history, retry_count, current_plan
  - Retry guard: MAX_RETRIES để tránh infinite loop

Flow mới:
    [User Request]
         │
         ▼
    [Supervisor] ────LLM decides────► [examiner | generator | done]
         ▲                                   │
         └───────────────────────────────────┘
                  (loop until done or max retries)
"""
import os
import sys
import json
import re

# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import Literal

from my_agent.utils.state import AgentState, InputState, is_human_message, is_ai_message, get_message_content
from my_agent.utils.llm_factory import get_llm
from my_agent.agents.sub_agents.examiner_agent import examiner_agent_node
# ... rest of imports
from my_agent.agents.sub_agents.generator_agent import generator_agent_node
from my_agent.config import AGENT_CONFIG
from my_agent.prompts import supervisor as supervisor_prompts

# ============================================================================
# CONSTANTS
# ============================================================================
MAX_RETRIES = 3  # Guard: tối đa bao nhiêu lần Supervisor có thể re-route

# ============================================================================
# LLM INITIALIZATION (via factory → MetaClaw hoặc fallback)
# ============================================================================
_supervisor_llm = get_llm(temperature=AGENT_CONFIG["supervisor"]["temperature"])


# ============================================================================
# TOOLS - Delegation signals
# ============================================================================

@tool
def delegate_to_examiner_agent(task: str) -> str:
    """Delegate a task to the Examiner Agent for RAG enrichment and API analysis.
    
    Use this when the user provides API documentation that needs to be analyzed
    and enriched with related historical context before MCP Server generation.
    
    Args:
        task: The complete task description with all API specifications.
    """
    if not task or not isinstance(task, str) or len(task.strip()) < 10:
        return "Error: task must be a non-empty string with meaningful content"
    return f"DELEGATE_TO_EXAMINER: {task}"


@tool
def delegate_to_generator_agent(task: str) -> str:
    """Delegate a task directly to the Generator Agent for MCP Server creation.
    
    Use this when the task has already been enriched by the Examiner, or when
    the API documentation is simple enough to generate directly without RAG enrichment.
    
    Args:
        task: The complete (possibly RAG-enriched) task description.
    """
    if not task or not isinstance(task, str) or len(task.strip()) < 10:
        return "Error: task must be a non-empty string with meaningful content"
    return f"DELEGATE_TO_GENERATOR: {task}"


@tool
def mark_task_complete(summary: str) -> str:
    """Mark the current task as complete and provide a final summary.
    
    Use this when you have a satisfactory result from the sub-agents
    and the user's request has been fulfilled.
    
    Args:
        summary: Brief summary of what was accomplished.
    """
    return f"TASK_COMPLETE: {summary}"


SUPERVISOR_TOOLS = [delegate_to_examiner_agent, delegate_to_generator_agent, mark_task_complete]


async def tools_node_wrapper(state: AgentState) -> AgentState:
    """
    Wrapper around ToolNode that repairs tool call arguments using the explicit state.
    Since we store raw_api_doc in the state, we don't need the LLM to pass it perfectly every time.
    """
    try:
        messages = list(state["messages"])
        raw_api_doc = state.get("raw_api_doc", "")
        enriched_context = state.get("enriched_context", "")

        for idx, msg in enumerate(reversed(messages)):
            actual_idx = len(messages) - 1 - idx
            # Use robust helper instead of brittle type check
            if not (is_ai_message(msg) and getattr(msg, "tool_calls", None)):
                continue

            print(f"[ToolNode] Checking tool_calls at index {actual_idx}")
            fixed_tool_calls = []
            needs_fix = False

            for tc in msg.tool_calls:
                tc_copy = dict(tc)
                tc_name = tc_copy.get("name", "")
                args = tc_copy.get("args", {})
                
                # Delegation tools repair logic
                if tc_name in ["delegate_to_examiner_agent", "delegate_to_generator_agent"]:
                    task_val = str(args.get("task", ""))
                    # If task is missing, generic, or too short, inject from state
                    is_generic = any(kw in task_val.lower() for kw in ["process", "specification", "history", "provided"])
                    
                    if not task_val or len(task_val) < 25 or is_generic:
                        needs_fix = True
                        if tc_name == "delegate_to_examiner_agent":
                            # Examiner always needs the raw documentation
                            tc_copy["args"] = {"task": raw_api_doc if raw_api_doc else task_val}
                            print(f"[ToolNode] ✅ Injected raw_api_doc into {tc_name}")
                        else:
                            # Generator prefers enriched context, fallback to raw
                            final_task = enriched_context if enriched_context else raw_api_doc
                            tc_copy["args"] = {"task": final_task if final_task else task_val}
                            print(f"[ToolNode] ✅ Injected enriched/raw doc into {tc_name}")
                
                fixed_tool_calls.append(tc_copy)

            if needs_fix:
                messages[actual_idx] = AIMessage(
                    content=msg.content,
                    tool_calls=fixed_tool_calls,
                    id=getattr(msg, "id", None)
                )
            break # Only process the most recent AI message

        fixed_state = dict(state)
        fixed_state["messages"] = messages
        tool_node = ToolNode(SUPERVISOR_TOOLS)
        return await tool_node.ainvoke(fixed_state)

    except Exception as e:
        print(f"[ToolNode] ❌ Error: {e}")
        import traceback; traceback.print_exc()
        return await ToolNode(SUPERVISOR_TOOLS).ainvoke(state)


# ============================================================================
# SUPERVISOR NODE - Phase 2: LLM-based dynamic routing
# ============================================================================

_ROUTING_SYSTEM_PROMPT = """You are an Orchestrator (MetaClaw Intelligence) supervising a multi-agent MCP Server creation system.

Available agents:
- **examiner**: Analyzes API documentation and enriches it with RAG context. Use FIRST for complex or new API requests.
- **generator**: Creates the MCP Server from documentation. Use AFTER examiner has provided the enriched context, or if you already have enough data.
- **done**: Mark the task complete and provide a final summary when the user's request is fulfilled (e.g., server is created).

ORCHESTRATION RULES:
1. **Sequence**: For "Create" requests, the standard path is `examiner` (context enrichment) -> `generator` (actual creation). 
2. **Technical Data**: Do not worry about copying long documentation manually. The system maintains a shared technical state. Focus on high-level steering.
3. **Completion**: If you see "TASK_SUCCESSFULLY_COMPLETED" in the history or if the generator output confirms the server is created with an ID, you MUST call the `mark_task_complete` tool immediately.
4. **Efficiency**: Use the `delegate_to_examiner_agent` if the user's API is complex. Use `delegate_to_generator_agent` once you have enough info.
5. **Directness**: Avoid redundant questions. Transition to the next logical step immediately.
"""


async def supervisor_node(state: AgentState) -> AgentState:
    """
    Phase 2 Supervisor: Uses LLM to dynamically decide next agent.
    
    Decision factors:
    - state["history"]: What has been done so far
    - state["retry_count"]: How many times we've retried
    - messages: Full conversation, including sub-agent outputs
    """
    messages = state["messages"]
    history = state.get("history", [])
    retry_count = state.get("retry_count", 0)
    
    print(f"\n[Supervisor] 🧠 Phase 2 routing | retry={retry_count} | history={history}")

    # ── Guard: Task already complete ────────────────────────────────────────
    if state.get("is_complete"):
        print("[Supervisor] ✅ Task marked complete via trigger. Forcing mark_task_complete.")
        response = AIMessage(content="The task is finished. Here is the final summary.")
        response.tool_calls = [{"name": "mark_task_complete", 
                                "args": {"summary": "MCP Server created and verified successfully."}, 
                                "id": "forced_complete_001"}]
        return {
            "messages": [response],
            "next_agent": "tools",
            "history": [],
            "retry_count": retry_count,
            "is_complete": True
        }

    # ── Guard: max retries reached → force completion ──────────────────────
    if retry_count >= MAX_RETRIES:
        print(f"[Supervisor] ⚠️ Max retries ({MAX_RETRIES}) reached. Forcing completion.")
        last_content = str(messages[-1].content) if messages else "Max retries exceeded."
        return {
            "messages": [],
            "next_agent": "end",
            "final_response": last_content,
            "history": history + [f"supervisor: forced completion after {retry_count} retries"],
            "retry_count": retry_count,
            "current_plan": "forced_completion"
        }

    # ── Build context summary for LLM decision ─────────────────────────────
    history_summary = "\n".join(f"  - {h}" for h in history) if history else "  - Nothing done yet"
    
    # ── Populate raw_api_doc from user input (First run only) ─────────────
    raw_api_doc = state.get("raw_api_doc", "")
    if not raw_api_doc:
        print("[Supervisor] 📋 Using first human message as raw_api_doc...")
        # Find first human message and use it directly to preserve full user input
        first_human = next((get_message_content(m) for m in messages if is_human_message(m)), "")
        if first_human:
            raw_api_doc = first_human
        else:
            raw_api_doc = ""
    
    # Extract user task for LLM decision
    user_task = raw_api_doc if raw_api_doc else "Process user request"
    
    # Find most recent sub-agent output (for re-evaluation)
    last_agent_output = ""
    for msg in reversed(messages):
        if getattr(msg, "type", "") == "ai" and not getattr(msg, "tool_calls", None):
            content = str(msg.content)
            if len(content) > 50:  # Skip trivial messages
                last_agent_output = content[:1500]
                break

    decision_context = f"""Current State:
- retry_count: {retry_count}
- History of completed steps:
{history_summary}

User's Original Request (first 2000 chars):
{user_task[:2000]}

Most Recent Agent Output:
{last_agent_output if last_agent_output else "No output yet"}
"""

    routing_messages = [
        HumanMessage(content=f"[SYSTEM]\n{_ROUTING_SYSTEM_PROMPT}\n\n[CURRENT STATE]\n{decision_context}\n\nDecide the next action by calling the appropriate tool:")
    ]

    # ── Call LLM with tools bound ──────────────────────────────────────────
    llm_with_tools = _supervisor_llm.bind_tools(SUPERVISOR_TOOLS)
    response = await llm_with_tools.ainvoke(routing_messages)
    
    has_tool_calls = bool(getattr(response, "tool_calls", None))

    # ── Fallback: parse text if LLM didn't produce tool_calls ─────────────
    if not has_tool_calls and hasattr(response, "content"):
        raw_content = str(response.content)
        content = raw_content.lower()
        print(f"[Supervisor] ⚠️ No tool_calls in response, attempting text parse...")
        
        # Check if we already have a success marker in history
        task_already_done = any("TASK_SUCCESSFULLY_COMPLETED" in h for h in history)

        # ── Direct prefix match (LLM echoed delegation strings) ───────────
        if "DELEGATE_TO_GENERATOR:" in raw_content:
            # Extract the task payload from the echoed string
            gen_task = raw_content[raw_content.index("DELEGATE_TO_GENERATOR:") + len("DELEGATE_TO_GENERATOR:"):].strip()
            if not gen_task:
                gen_task = user_task
            print(f"[Supervisor] Fallback → delegate_to_generator_agent (direct prefix match)")
            response.tool_calls = [{"name": "delegate_to_generator_agent",
                                    "args": {"task": gen_task}, "id": "fallback_prefix_gen"}]
            has_tool_calls = True
        elif "DELEGATE_TO_EXAMINER:" in raw_content:
            exam_task = raw_content[raw_content.index("DELEGATE_TO_EXAMINER:") + len("DELEGATE_TO_EXAMINER:"):].strip()
            if not exam_task:
                exam_task = user_task
            print(f"[Supervisor] Fallback → delegate_to_examiner_agent (direct prefix match)")
            response.tool_calls = [{"name": "delegate_to_examiner_agent",
                                    "args": {"task": exam_task}, "id": "fallback_prefix_exam"}]
            has_tool_calls = True
        elif any(kw in content for kw in ["complete", "successfully", "done", "finished", "here is", "all set"]):
            print(f"[Supervisor] Fallback → mark_task_complete (detected completion keywords)")
            response.tool_calls = [{"name": "mark_task_complete",
                                    "args": {"summary": raw_content[:500]}, "id": "fallback_003"}]
            has_tool_calls = True
        elif not task_already_done and "examiner" in content and any(kw in content for kw in ["delegate", "ask", "examine", "analyze", "run"]):
            print(f"[Supervisor] Fallback → delegate_to_examiner_agent")
            response.tool_calls = [{"name": "delegate_to_examiner_agent",
                                    "args": {"task": user_task}, "id": "fallback_001"}]
            has_tool_calls = True
        elif not task_already_done and ("generator" in content or "create" in content or "delegate_to_generator" in content) and any(kw in content for kw in ["delegate", "call", "run", "start", "generate", "generator"]):
            print(f"[Supervisor] Fallback → delegate_to_generator_agent")
            response.tool_calls = [{"name": "delegate_to_generator_agent",
                                    "args": {"task": user_task}, "id": "fallback_002"}]
            has_tool_calls = True

    next_agent = "tools" if has_tool_calls else "end"
    print(f"[Supervisor] → Route to: {next_agent}")

    return {
        "messages": [response],
        "next_agent": next_agent,
        "final_response": "",
        "history": [], # history uses operator.add, so we return empty if no NEW history
        "retry_count": retry_count,
        "is_complete": state.get("is_complete", False),
        "current_plan": str(getattr(response, "content", ""))[:200],
        "raw_api_doc": raw_api_doc,
        "enriched_context": state.get("enriched_context", "")
    }


# ============================================================================
# SUPERVISOR FINAL NODE - Evaluates result, decides to retry or finish
# ============================================================================

async def supervisor_final_node(state: AgentState) -> AgentState:
    """
    Phase 2 Supervisor Final (MetaClaw version):
    - Uses LLM to evaluate if the sub-agent's work is truly complete and successful.
    - Sets is_complete trigger based on LLM evaluation.
    - FAST PATH: If examiner just ran and produced DELEGATE_TO_GENERATOR, bypass
      Supervisor LLM and inject a direct generator delegation tool call.
    """
    history = state.get("history", [])
    retry_count = state.get("retry_count", 0)
    messages = state["messages"]
    
    # ── Detect which agent just ran ────────────────────────────────────────
    agent_that_ran = "unknown"
    for h in reversed(history):
        if "_ran_examiner" in h:
            agent_that_ran = "examiner"
            break
        if "_ran_generator" in h:
            agent_that_ran = "generator"
            break
            
    print(f"\n[SupervisorFinal] 🔍 LLM Evaluation: {agent_that_ran} just finished.")

    # ── FAST PATH: Examiner → Generator (bypass LLM routing) ──────────────
    # When examiner finishes, its last message IS the enriched task prefixed with
    # DELEGATE_TO_GENERATOR. Instead of asking the Supervisor LLM to re-decide
    # (which fails to produce tool_calls), we directly inject the tool call.
    if agent_that_ran == "examiner":
        # Find the examiner's delegation message (the content after DELEGATE_TO_GENERATOR)
        # We also look in enriched_context state field which is safer
        examiner_output = state.get("enriched_context", "")

        # Fallback to message parsing if state is somehow missing it
        if not examiner_output:
            for msg in reversed(messages):
                if is_ai_message(msg) and "DELEGATE_TO_GENERATOR:" in get_message_content(msg):
                    raw = get_message_content(msg)
                    examiner_output = raw[raw.index("DELEGATE_TO_GENERATOR:") + len("DELEGATE_TO_GENERATOR:"):].strip()
                    break

        if examiner_output:
            print("[SupervisorFinal] ⚡ Fast-path: Examiner produced enriched context. Injecting generator tool call.")
            injected_response = AIMessage(
                content="Examiner completed. Delegating enriched task to Generator.",
                tool_calls=[{
                    "name": "delegate_to_generator_agent",
                    "args": {"task": examiner_output},
                    "id": "fastpath_generator_001"
                }]
            )
            new_history_entries = []
            if not any("examiner: completed" in h for h in history):
                new_history_entries.append("examiner: completed RAG enrichment")
            return {
                "messages": [injected_response],
                "next_agent": "tools",  # ← goes through tools → generator
                "final_response": "",
                "history": new_history_entries,
                "retry_count": retry_count,
                "is_complete": False,
                "current_plan": "fast_path_examiner_to_generator",
                "raw_api_doc": state.get("raw_api_doc", ""),
                "enriched_context": state.get("enriched_context", "")
            }
        else:
            print("[SupervisorFinal] ⚠️ Examiner ran but no DELEGATE_TO_GENERATOR found. Falling back to supervisor.")

    # ── LLM-based Evaluation (for generator and unknown agents) ───────────
    is_complete = False
    if messages and agent_that_ran == "generator":
        last_output = str(messages[-1].content)
        
        eval_prompt = f"""Analyze the following output from a Generator Agent and determine if the MCP Server creation was SUCCESSFUL.

OUTPUT TO ANALYZE:
---
{last_output[:2000]}
---

Criteria for SUCCESS:
1. The agent explicitly states the server was created successfully.
2. A 'Server ID' or unique identifier is provided.
3. There are no major error messages indicating the process failed.

Return ONLY a JSON object:
{{
    "success": true/false,
    "reason": "short explanation"
}}"""
        try:
            eval_resp = await _supervisor_llm.ainvoke([HumanMessage(content=eval_prompt)])
            eval_content = str(eval_resp.content).strip()
            # Clean JSON if wrapped in markdown
            if "```json" in eval_content:
                eval_content = eval_content.split("```json")[1].split("```")[0].strip()
            elif "```" in eval_content:
                eval_content = eval_content.split("```")[1].split("```")[0].strip()
            
            evaluation = json.loads(eval_content)
            if evaluation.get("success"):
                is_complete = True
                print(f"[SupervisorFinal] ✅ LLM confirmed success: {evaluation.get('reason')}")
            else:
                print(f"[SupervisorFinal] ❌ LLM confirmed incomplete: {evaluation.get('reason')}")
        except Exception as e:
            print(f"[SupervisorFinal] ⚠️ LLM Evaluation failed, falling back to keywords: {e}")
            # Fallback to keywords if LLM fail
            if any(kw in last_output.lower() for kw in ["successfully created", "server id:", "server created"]):
                is_complete = True

    # ── Update history (only new entries for operator.add) ────────────────
    new_history_entries = []
    
    if agent_that_ran == "generator":
        if not any("generator: completed" in h for h in history):
            new_history_entries.append(f"generator: completed creation attempt (success={is_complete})")

    # If complete or if we've reached max retries, return to supervisor
    if is_complete:
        print("[SupervisorFinal] Task marked complete. Returning to supervisor for final response.")
        new_history_entries.append("TASK_SUCCESSFULLY_COMPLETED: The sub-agent has delivered the final result.")
        new_retry_count = retry_count
    else:
        new_retry_count = retry_count + 1
    
    return {
        "messages": [],
        "next_agent": "supervisor",
        "final_response": "",
        "history": new_history_entries,
        "retry_count": new_retry_count,
        "is_complete": is_complete,
        "current_plan": f"evaluated_{agent_that_ran}_output",
        "raw_api_doc": state.get("raw_api_doc", ""),
        "enriched_context": state.get("enriched_context", "")
    }


# ============================================================================
# EXAMINER WRAPPER - Updates history after examiner runs
# ============================================================================

async def examiner_node_with_tracking(state: AgentState) -> AgentState:
    """Wrapper around examiner_agent_node that updates state history."""
    result = await examiner_agent_node(state)
    # Since history uses operator.add, we just return the NEW marker
    return {
        **result,
        "history": ["_ran_examiner"],
        "retry_count": state.get("retry_count", 0),
        "is_complete": state.get("is_complete", False),
        "current_plan": state.get("current_plan", ""),
        "raw_api_doc": state.get("raw_api_doc", ""),
        "enriched_context": result.get("enriched_context", state.get("enriched_context", ""))
    }


async def generator_node_with_tracking(state: AgentState) -> AgentState:
    """Wrapper around generator_agent_node that updates state history."""
    result = await generator_agent_node(state)
    return {
        **result,
        "history": ["_ran_generator"],
        "retry_count": state.get("retry_count", 0),
        "is_complete": state.get("is_complete", False),
        "current_plan": state.get("current_plan", ""),
        "raw_api_doc": state.get("raw_api_doc", ""),
        "enriched_context": state.get("enriched_context", "")
    }


# ============================================================================
# ROUTING FUNCTIONS
# ============================================================================

def route_supervisor(state: AgentState) -> Literal["tools", "end"]:
    """Route from supervisor: go to tools if it has tool_calls, else end."""
    next_agent = state.get("next_agent", "end")
    return "tools" if next_agent == "tools" else "end"


def route_after_tools(state: AgentState) -> Literal["examiner", "generator", "supervisor", "end"]:
    """
    Route after tool execution based on the LATEST tool result block.
    Stop searching once we hit an AIMessage to avoid acting on stale delegation signals.
    """
    messages = state["messages"]
    for msg in reversed(messages):
        # If we hit the AI message that called the tools, we stop searching backwards.
        # This ensures we only act on the ToolMessages resulting from the current call.
        if isinstance(msg, AIMessage):
            break

        if isinstance(msg, ToolMessage):
            content = str(msg.content)
            if "DELEGATE_TO_EXAMINER" in content:
                print("[Router] → examiner")
                return "examiner"
            if "DELEGATE_TO_GENERATOR" in content:
                print("[Router] → generator")
                return "generator"
            if "TASK_COMPLETE" in content:
                print("[Router] → end (task complete)")
                return "end"
    
    print("[Router] → end (no delegation found in latest turn)")
    return "end"


def route_supervisor_final(state: AgentState) -> Literal["supervisor", "tools", "end"]:
    """
    Phase 2 loop: Supervisor Final can route BACK to Supervisor for iteration,
    OR directly to tools (fast-path: examiner → generator bypass).
    """
    next_agent = state.get("next_agent", "end")
    if next_agent == "tools":
        return "tools"  # ← fast-path: examiner produced generator delegation
    return "supervisor" if next_agent == "supervisor" else "end"


# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================

def create_multi_agent_graph():
    """
    Phase 2 Graph: Dynamic Orchestrator with Iteration Loop.

    Flow:
        supervisor → tools → examiner/generator → supervisor_final
                ▲                                        │
                └──────── (loop: retry or re-route) ─────┘

    Key change from Phase 1:
    - supervisor_final can route BACK to supervisor (iteration)
    - supervisor uses LLM to decide next agent (not hardcoded keywords)
    - history/retry_count guards against infinite loops
    """
    workflow = StateGraph(AgentState, input_schema=InputState)

    # ── Nodes ──────────────────────────────────────────────────────────────
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("tools", tools_node_wrapper)
    workflow.add_node("examiner", examiner_node_with_tracking)
    workflow.add_node("generator", generator_node_with_tracking)
    workflow.add_node("supervisor_final", supervisor_final_node)

    # ── Entry point ────────────────────────────────────────────────────────
    workflow.set_entry_point("supervisor")

    # ── Edges ──────────────────────────────────────────────────────────────
    # Supervisor → Tools (if tool_calls) or END
    workflow.add_conditional_edges(
        "supervisor",
        route_supervisor,
        {"tools": "tools", "end": END}
    )

    # Tools → Examiner / Generator / END
    workflow.add_conditional_edges(
        "tools",
        route_after_tools,
        {
            "examiner": "examiner",
            "generator": "generator",
            "end": END
        }
    )

    # Both sub-agents → Supervisor Final for evaluation
    workflow.add_edge("examiner", "supervisor_final")
    workflow.add_edge("generator", "supervisor_final")

    # ── Phase 2 Key: Supervisor Final → Supervisor (loop), Tools (fast-path), or END
    workflow.add_conditional_edges(
        "supervisor_final",
        route_supervisor_final,
        {
            "supervisor": "supervisor",  # ← Iteration loop
            "tools": "tools",             # ← Fast-path: examiner → generator
            "end": END
        }
    )

    return workflow.compile()


# ============================================================================
# EXPORT (for LangGraph Server / langgraph.json)
# ============================================================================
app = create_multi_agent_graph()


# ============================================================================
# MultiAgentSystem helper class (backward compat)
# ============================================================================

class MultiAgentSystem:
    """Multi-Agent System with Phase 2 Dynamic Orchestrator."""

    def __init__(self):
        print("Initializing Multi-Agent System (Phase 2 - Dynamic Orchestrator)...")
        self.graph = create_multi_agent_graph()
        print("✓ Supervisor (LLM-based dynamic routing)")
        print("✓ Examiner Agent")
        print("✓ Generator Agent")
        print(f"✓ Max retries: {MAX_RETRIES}")
        print("\nMulti-Agent System Ready!\n")

    async def run(self, query: str) -> str:
        """Run a query through the Phase 2 dynamic multi-agent system."""
        print(f"{'='*60}")
        print(f"Query: {query[:200]}")
        print(f"{'='*60}\n")

        initial_state: AgentState = {
            "messages": [HumanMessage(content=query)],
            "next_agent": "supervisor",
            "final_response": "",
            "history": [],
            "retry_count": 0,
            "is_complete": False,
            "current_plan": "initial",
            "raw_api_doc": "",
            "enriched_context": ""
        }

        try:
            result = await self.graph.ainvoke(initial_state)
            final_response = result.get("final_response", "")
            messages = result.get("messages", [])
            
            if not final_response and messages:
                final_response = str(messages[-1].content) if hasattr(messages[-1], "content") else str(messages[-1])

            print(f"\n{'='*60}")
            print(f"EXECUTION HISTORY: {result.get('history', [])}")
            print(f"RETRIES USED: {result.get('retry_count', 0)}")
            print(f"{'='*60}\n")
            print("FINAL RESPONSE:")
            print(final_response)

            return final_response

        except Exception as e:
            import traceback
            print(f"\n❌ Error: {e}")
            traceback.print_exc()
            return f"Error: {e}"

    async def interactive_mode(self):
        """Interactive CLI mode."""
        print("\n" + "="*60)
        print("INTERACTIVE MODE (Phase 2 Dynamic Orchestrator)")
        print("="*60)
        print("Type 'exit' to quit\n")

        while True:
            try:
                user_input = input("You: ").strip()
                if not user_input:
                    continue
                if user_input.lower() in ("exit", "quit", "q"):
                    print("\nGoodbye!")
                    break
                await self.run(user_input)
            except KeyboardInterrupt:
                print("\n\nGoodbye!")
                break
            except Exception as e:
                print(f"\nError: {e}\n")


# ============================================================================
# CLI Entry point
# ============================================================================
import asyncio

def main():
    system = MultiAgentSystem()
    asyncio.run(system.interactive_mode())

if __name__ == "__main__":
    main()
