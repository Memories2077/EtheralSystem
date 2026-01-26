"""
Utilities and Helper Functions
"""
from typing import Any, Dict, List


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
