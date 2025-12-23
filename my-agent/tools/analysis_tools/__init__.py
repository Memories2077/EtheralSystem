"""
Analysis Tools - Tools for data analysis and report generation
"""
from typing import Dict, Any, List, Optional
import json


def analyze_data(
    data: Dict[str, Any],
    analysis_type: str = "summary"
) -> Dict[str, Any]:
    """
    Analyze data and extract insights
    
    Args:
        data: Data to analyze (dict or list)
        analysis_type: Type of analysis (summary, statistical, comparative)
        
    Returns:
        Analysis results with insights
    """
    analysis = {
        "type": analysis_type,
        "data_size": len(data) if isinstance(data, (list, dict)) else 0,
        "insights": []
    }
    
    if isinstance(data, dict):
        analysis["keys"] = list(data.keys())
        analysis["insights"].append(f"Data contains {len(data)} fields")
    elif isinstance(data, list):
        analysis["items_count"] = len(data)
        analysis["insights"].append(f"Data contains {len(data)} items")
    
    return analysis


def compare_data(
    dataset_a: Any,
    dataset_b: Any,
    comparison_criteria: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Compare two datasets based on specified criteria
    
    Args:
        dataset_a: First dataset
        dataset_b: Second dataset
        comparison_criteria: Criteria for comparison
        
    Returns:
        Comparison results
    """
    comparison = {
        "dataset_a_type": type(dataset_a).__name__,
        "dataset_b_type": type(dataset_b).__name__,
        "are_equal": dataset_a == dataset_b,
        "differences": []
    }
    
    if isinstance(dataset_a, dict) and isinstance(dataset_b, dict):
        keys_a = set(dataset_a.keys())
        keys_b = set(dataset_b.keys())
        comparison["unique_to_a"] = list(keys_a - keys_b)
        comparison["unique_to_b"] = list(keys_b - keys_a)
        comparison["common_keys"] = list(keys_a & keys_b)
    
    return comparison


def generate_report(
    title: str,
    sections: Dict[str, Any],
    format: str = "markdown"
) -> str:
    """
    Generate a structured report from analysis results
    
    Args:
        title: Report title
        sections: Dictionary of section names and content
        format: Output format (markdown, text)
        
    Returns:
        Formatted report
    """
    if format == "markdown":
        report = f"# {title}\n\n"
        for section_name, content in sections.items():
            report += f"## {section_name}\n\n"
            if isinstance(content, dict):
                report += json.dumps(content, indent=2) + "\n\n"
            else:
                report += f"{content}\n\n"
    else:
        report = f"{title}\n{'='*len(title)}\n\n"
        for section_name, content in sections.items():
            report += f"{section_name}\n{'-'*len(section_name)}\n{content}\n\n"
    
    return report


def identify_trends(
    data_points: List[Any],
    metric_name: str = "value"
) -> Dict[str, Any]:
    """
    Identify trends in data points
    
    Args:
        data_points: List of data points to analyze
        metric_name: Name of the metric being analyzed
        
    Returns:
        Trend analysis
    """
    if not data_points:
        return {"trend": "no_data", "message": "No data points provided"}
    
    trends = {
        "metric": metric_name,
        "data_points_count": len(data_points),
        "first_value": data_points[0],
        "last_value": data_points[-1],
    }
    
    # Simple trend detection
    if len(data_points) >= 2:
        if data_points[-1] > data_points[0]:
            trends["trend"] = "increasing"
        elif data_points[-1] < data_points[0]:
            trends["trend"] = "decreasing"
        else:
            trends["trend"] = "stable"
    
    return trends


def calculate_statistics(numbers: List[float]) -> Dict[str, Any]:
    """
    Calculate basic statistics for a list of numbers
    
    Args:
        numbers: List of numbers
        
    Returns:
        Dictionary of statistical measures
    """
    if not numbers:
        return {"error": "No numbers provided"}
    
    sorted_numbers = sorted(numbers)
    n = len(numbers)
    
    stats = {
        "count": n,
        "sum": sum(numbers),
        "mean": sum(numbers) / n,
        "min": min(numbers),
        "max": max(numbers),
        "range": max(numbers) - min(numbers),
        "median": sorted_numbers[n // 2] if n % 2 == 1 else (sorted_numbers[n // 2 - 1] + sorted_numbers[n // 2]) / 2
    }
    
    return stats


# Export tools list
ANALYSIS_TOOLS = [
    analyze_data,
    compare_data,
    generate_report,
    identify_trends,
    calculate_statistics
]
