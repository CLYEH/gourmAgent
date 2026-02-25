"""Core agentic loop using the Anthropic SDK with tool use."""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic

from gourmAgent.tools import places as places_tools
from gourmAgent.tools import prefs as prefs_tools

SYSTEM_PROMPT = """You are gourmAgent, a friendly and knowledgeable restaurant discovery assistant.

Your goal is to help users find restaurants they will enjoy.

## How you work

1. **Understand preferences** — Before recommending restaurants, use get_preferences to check
   if the user has saved preferences. If this is the first message, briefly ask about cuisine
   preferences, dietary restrictions, or price range (one question at a time, not all at once).

2. **Save what you learn** — Whenever the user mentions food preferences, dietary needs, or
   price expectations, call save_preference to persist them.

3. **Search restaurants** — Use search_restaurants with a targeted query based on the user's
   preferences and location. Always pass the location provided in the request.

4. **Return ranked results** — Recommend at least 3 restaurants. For each, include:
   - Name
   - Address
   - Rating (out of 5)
   - Price level ($ to $$$$)
   - A one-sentence description of why it matches the user's preferences

5. **Offer details** — If the user asks for more info on a specific restaurant, call get_details.

## Tone

Be warm, conversational, and concise. Avoid bullet-point walls — use natural language.
"""

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


ALL_TOOLS = places_tools.TOOLS + prefs_tools.TOOLS

_TOOL_DISPATCH: dict[str, Any] = {
    "search_restaurants": places_tools.search_restaurants,
    "get_details": places_tools.get_details,
    "save_preference": prefs_tools.save_preference,
    "get_preferences": prefs_tools.get_preferences,
}


def _dispatch_tool(name: str, inputs: dict[str, Any]) -> Any:
    fn = _TOOL_DISPATCH.get(name)
    if fn is None:
        raise ValueError(f"Unknown tool: {name}")
    return fn(**inputs)


def run(user_id: str, message: str, location: str) -> dict[str, Any]:
    """Run one turn of the agent.

    Args:
        user_id: Stable identifier for the user (used for preference persistence).
        message: The user's latest message.
        location: Location to search near (e.g. "San Francisco, CA").

    Returns:
        Dict with keys:
          - response (str): Final assistant text
          - tool_calls (list): All tool calls made during this turn
    """
    client = _get_client()
    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": f"[user_id={user_id}] [location={location}]\n\n{message}",
        }
    ]

    tool_calls_log: list[dict[str, Any]] = []

    while True:
        response = client.messages.create(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=ALL_TOOLS,
            messages=messages,
        )

        # Collect any tool uses from this response
        tool_uses = [block for block in response.content if block.type == "tool_use"]

        if response.stop_reason == "end_turn" or not tool_uses:
            # Extract final text
            text_blocks = [block.text for block in response.content if block.type == "text"]
            final_text = "\n".join(text_blocks)
            return {"response": final_text, "tool_calls": tool_calls_log}

        # Append assistant message with tool_use blocks
        messages.append({"role": "assistant", "content": response.content})

        # Execute tools and build tool_result blocks
        tool_results: list[dict[str, Any]] = []
        for tu in tool_uses:
            try:
                result = _dispatch_tool(tu.name, tu.input)
                result_content = json.dumps(result)
                is_error = False
            except Exception as exc:
                result_content = json.dumps({"error": str(exc)})
                is_error = True

            tool_calls_log.append(
                {"tool": tu.name, "input": tu.input, "output": result_content, "error": is_error}
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": result_content,
                    "is_error": is_error,
                }
            )

        messages.append({"role": "user", "content": tool_results})
