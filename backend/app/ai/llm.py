"""Thin wrapper around the Claude API.

Every caller treats Claude as an optional enhancement: if no API key is configured, the request
fails, or the model declines, these helpers return None and the caller uses its rule-based path.
"""
import json
import logging
from typing import Any

import anthropic

from ..config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()

# Server-side refusal fallback: if the primary model declines, the API re-runs the request on
# Anthropic's recommended fallback model instead of returning a refusal.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: anthropic.Anthropic | None = None


def is_enabled() -> bool:
    return bool(settings.anthropic_api_key)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.ai_timeout_seconds, max_retries=2)
    return _client


def _call(system: str, content: list[dict] | str, max_tokens: int, output_schema: dict | None, messages: list[dict] | None):
    kwargs: dict[str, Any] = {
        "model": settings.ai_model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages if messages is not None else [{"role": "user", "content": content}],
        "thinking": {"type": "adaptive"},
        "extra_headers": {"anthropic-beta": _FALLBACK_BETA},
        "extra_body": {"fallbacks": "default"},
    }
    output_config: dict[str, Any] = {"effort": "medium"}
    if output_schema is not None:
        output_config["format"] = {"type": "json_schema", "schema": output_schema}
    kwargs["output_config"] = output_config
    return _get_client().messages.create(**kwargs)


def _text_of(response) -> str | None:
    if response.stop_reason == "refusal":
        log.warning("Claude declined request (category=%s)", getattr(response.stop_details, "category", None))
        return None
    if response.stop_reason == "max_tokens":
        log.warning("Claude response truncated at max_tokens")
        return None
    parts = [b.text for b in response.content if b.type == "text"]
    return "".join(parts).strip() or None


def complete_json(system: str, content: list[dict] | str, schema: dict, max_tokens: int = 4000) -> dict | None:
    """Structured-output call. Returns the parsed JSON object or None on any failure."""
    if not is_enabled():
        return None
    try:
        text = _text_of(_call(system, content, max_tokens, schema, None))
        return json.loads(text) if text else None
    except json.JSONDecodeError:
        log.warning("Claude returned invalid JSON")
    except anthropic.AuthenticationError:
        log.error("Claude API key is invalid; falling back to rule-based AI")
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; falling back to rule-based AI")
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
    except anthropic.APIConnectionError:
        log.warning("Cannot reach Claude API; falling back to rule-based AI")
    return None


def complete_chat(system: str, messages: list[dict], max_tokens: int = 2000) -> str | None:
    """Free-text multi-turn call used by the NutriBot assistant."""
    if not is_enabled():
        return None
    try:
        return _text_of(_call(system, "", max_tokens, None, messages))
    except anthropic.AuthenticationError:
        log.error("Claude API key is invalid; falling back to rule-based assistant")
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; falling back to rule-based assistant")
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
    except anthropic.APIConnectionError:
        log.warning("Cannot reach Claude API; falling back to rule-based assistant")
    return None
