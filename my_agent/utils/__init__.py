"""
Utilities and Helper Functions
"""
from typing import Any, Dict, List


def extract_content_from_openai_response(response_json: Dict[str, Any]) -> str:
    """
    Extract content from OpenAI-style API response
    
    Args:
        response_json: JSON response from OpenAI-compatible API
        
    Returns:
        Extracted content string
        
    Example:
        >>> response = {
        ...     "choices": [{
        ...         "message": {
        ...             "content": "",
        ...             "reasoning_content": "Hello!"
        ...         }
        ...     }]
        ... }
        >>> extract_content_from_openai_response(response)
        'Hello!'
    """
    try:
        # Standard OpenAI response format
        if "choices" in response_json and len(response_json["choices"]) > 0:
            choice = response_json["choices"][0]
            
            # Check for message.reasoning_content (new model format)
            if "message" in choice:
                message = choice["message"]
                # Priority: reasoning_content > content
                if "reasoning_content" in message and message["reasoning_content"]:
                    return message["reasoning_content"].strip()
                if "content" in message:
                    return message["content"].strip()
            
            # Check for delta.content (streaming)
            if "delta" in choice and "content" in choice["delta"]:
                return choice["delta"]["content"].strip()
            
            # Fallback to text field
            if "text" in choice:
                return choice["text"].strip()
        
        # If no standard format found, return the whole response as string
        return str(response_json)
    
    except Exception as e:
        # Return error message if parsing fails
        return f"Error parsing response: {str(e)}\nRaw response: {str(response_json)[:500]}"


def extract_text_from_content(content: Any) -> str:
    """
    Extract plain text from various content formats
    
    Args:
        content: Content to extract text from
        
    Returns:
        Plain text string
    """
    if isinstance(content, str):
        return content
    
    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and 'text' in item:
                text_parts.append(item['text'])
            else:
                text_parts.append(str(item))
        return '\n'.join(text_parts)
    
    if isinstance(content, dict):
        if 'text' in content:
            return content['text']
        if 'content' in content:
            return extract_text_from_content(content['content'])
    
    return str(content)


def format_dict_as_text(data: Dict[str, Any], indent: int = 0) -> str:
    """
    Format dictionary as readable text
    
    Args:
        data: Dictionary to format
        indent: Indentation level
        
    Returns:
        Formatted text
    """
    lines = []
    indent_str = "  " * indent
    
    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"{indent_str}{key}:")
            lines.append(format_dict_as_text(value, indent + 1))
        elif isinstance(value, list):
            lines.append(f"{indent_str}{key}:")
            for item in value:
                if isinstance(item, dict):
                    lines.append(format_dict_as_text(item, indent + 1))
                else:
                    lines.append(f"{indent_str}  - {item}")
        else:
            lines.append(f"{indent_str}{key}: {value}")
    
    return '\n'.join(lines)


def truncate_text(text: str, max_length: int = 200, suffix: str = "...") -> str:
    """
    Truncate text to maximum length
    
    Args:
        text: Text to truncate
        max_length: Maximum length
        suffix: Suffix to add if truncated
        
    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to remove invalid characters
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename
    """
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename
