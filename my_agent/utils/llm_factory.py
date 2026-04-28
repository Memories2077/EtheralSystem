"""
LLM Factory - Centralized LLM initialization logic
"""
import os
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from pydantic import SecretStr
from typing import Optional, Any

from my_agent.config import API_CONFIG, PROVIDER_CONFIG

def get_llm(model_name: Optional[str] = None, temperature: float = 0.3, **kwargs: Any):
    """
    Get an LLM instance based on configuration and availability.
    If MetaClaw is enabled, it returns a ChatOpenAI instance pointing to the proxy.
    
    Args:
        model_name: Optional model name. If MetaClaw is enabled, this is ignored 
                   as MetaClaw handles routing by default.
        temperature: LLM temperature
        **kwargs: Additional parameters for the LLM
        
    Returns:
        A LangChain LLM instance (ChatOpenAI, ChatGoogleGenerativeAI, or ChatGroq)
    """
    metaclaw_enabled = os.getenv("METACLAW_ENABLED", "false").lower() == "true"
    
    # 1. MetaClaw Proxy (Highest Priority)
    if metaclaw_enabled:
        base_url = API_CONFIG.get("metaclaw_base_url")
        api_key = API_CONFIG.get("metaclaw_api_key", "metaclaw")

        # Default model for MetaClaw if None provided,
        # though MetaClaw often ignores this if it has its own logic.
        # We use the configured metaclaw model from PROVIDER_CONFIG as a placeholder.
        target_model = PROVIDER_CONFIG.get("metaclaw")

        print(f"[LLM-Factory] Using MetaClaw proxy at {base_url}")
        # Merge session_done into model_kwargs to enable memory ingestion
        return ChatOpenAI(
            model=target_model,
            base_url=base_url,
            api_key=SecretStr(api_key),
            temperature=temperature,
            top_p=API_CONFIG.get("metaclaw_top_p", 0.5),
            max_tokens=API_CONFIG.get("metaclaw_max_tokens", 100000),
            **kwargs
        )
    
    # 2. Fallback to Direct Providers
    gemini_api_key = API_CONFIG.get("gemini_api_key")
    if gemini_api_key:
        final_model = model_name or PROVIDER_CONFIG.get("gemini", "gemini-2.5-flash")
        print(f"[LLM-Factory] Using direct Gemini ({final_model})")
        return ChatGoogleGenerativeAI(
            model=final_model,
            api_key=SecretStr(gemini_api_key),
            temperature=temperature,
            **kwargs
        )
        
    groq_api_key = API_CONFIG.get("groq_api_key")
    if groq_api_key:
        final_model = model_name or PROVIDER_CONFIG.get("groq", "mixtral-8x7b-32768")
        print(f"[LLM-Factory] Using direct Groq ({final_model})")
        return ChatGroq(
            model_name=final_model,
            api_key=SecretStr(groq_api_key),
            temperature=temperature,
            **kwargs
        )
        
    raise ValueError("No valid LLM configuration found. Ensure GEMINI_API_KEY, GROQ_API_KEY, or METACLAW_ENABLED is set.")
