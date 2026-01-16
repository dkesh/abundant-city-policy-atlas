"""
AI Provider Abstraction Layer
Supports both Anthropic Claude and OpenAI GPT models.
"""

import os
import json
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Abstract base class for AI providers."""
    
    @abstractmethod
    def complete(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """
        Send a completion request to the AI provider.
        
        Returns:
            Dict with 'content', 'model', 'usage' keys
        """
        pass
    
    @abstractmethod
    def get_model_name(self) -> str:
        """Get the model name being used."""
        pass


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-5-20250929"):
        try:
            import anthropic
        except ImportError:
            raise ImportError("anthropic package required. Install with: pip install anthropic")
        
        self.client = anthropic.Anthropic(api_key=api_key or os.getenv('ANTHROPIC_API_KEY'))
        self.model = model
    
    def complete(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Send completion request to Anthropic."""
        max_tokens = kwargs.get('max_tokens', 4096)
        temperature = kwargs.get('temperature', 0.3)
        
        messages = [{"role": "user", "content": prompt}]
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=messages
        )
        
        # Extract content (handle both text and block types)
        content = ""
        if hasattr(response.content, '__iter__'):
            for block in response.content:
                if hasattr(block, 'text'):
                    content += block.text
                elif isinstance(block, str):
                    content += block
        else:
            content = str(response.content)
        
        return {
            'content': content,
            'model': self.model,
            'usage': {
                'input_tokens': response.usage.input_tokens,
                'output_tokens': response.usage.output_tokens
            }
        }
    
    def get_model_name(self) -> str:
        return self.model


class OpenAIProvider(AIProvider):
    """OpenAI GPT provider."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai package required. Install with: pip install openai")
        
        self.client = OpenAI(api_key=api_key or os.getenv('OPENAI_API_KEY'))
        self.model = model
    
    def complete(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Send completion request to OpenAI."""
        max_tokens = kwargs.get('max_tokens', 4096)
        temperature = kwargs.get('temperature', 0.3)
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"}  # Force JSON response
        )
        
        content = response.choices[0].message.content
        
        return {
            'content': content,
            'model': self.model,
            'usage': {
                'input_tokens': response.usage.prompt_tokens,
                'output_tokens': response.usage.completion_tokens
            }
        }
    
    def get_model_name(self) -> str:
        return self.model


def get_ai_provider(provider: Optional[str] = None, **kwargs) -> AIProvider:
    """
    Factory function to get the configured AI provider.
    
    Args:
        provider: 'anthropic' or 'openai'. If None, uses AI_PROVIDER env var.
        **kwargs: Additional arguments passed to provider constructor.
    
    Returns:
        AIProvider instance
    """
    provider = provider or os.getenv('AI_PROVIDER', 'anthropic').lower()
    
    if provider == 'anthropic':
        return AnthropicProvider(**kwargs)
    elif provider == 'openai':
        return OpenAIProvider(**kwargs)
    else:
        raise ValueError(f"Unknown AI provider: {provider}. Must be 'anthropic' or 'openai'")


def parse_json_response(content: str) -> Dict[str, Any]:
    """
    Parse JSON response from AI, handling common issues.
    
    Args:
        content: Raw content string from AI
    
    Returns:
        Parsed JSON dict
    """
    # Try to extract JSON if wrapped in markdown code blocks
    if '```json' in content:
        start = content.find('```json') + 7
        end = content.find('```', start)
        content = content[start:end].strip()
    elif '```' in content:
        start = content.find('```') + 3
        end = content.find('```', start)
        content = content[start:end].strip()
    
    # Remove leading/trailing whitespace
    content = content.strip()
    
    # Try to parse JSON
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        # Log the error and return empty dict
        print(f"Failed to parse JSON response: {e}")
        print(f"Content: {content[:500]}...")
        return {}
