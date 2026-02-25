"""User preference tools for the Claude agent."""

from __future__ import annotations

from typing import Any

from gourmAgent.memory.store import Preference, User, get_session


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def save_preference(
    user_id: str,
    cuisines_liked: list[str] | None = None,
    cuisines_disliked: list[str] | None = None,
    dietary_restrictions: list[str] | None = None,
    price_range: str | None = None,
    liked_place_ids: list[str] | None = None,
    disliked_place_ids: list[str] | None = None,
) -> dict[str, str]:
    """Persist or update preference data for a user.

    Any field left as None is not overwritten (partial update semantics).
    """
    with get_session() as session:
        user = session.get(User, user_id)
        if user is None:
            user = User(id=user_id)
            session.add(user)

        pref = session.query(Preference).filter_by(user_id=user_id).first()
        if pref is None:
            pref = Preference(user_id=user_id)
            session.add(pref)

        if cuisines_liked is not None:
            existing = pref.cuisines_liked or []
            pref.cuisines_liked = list(set(existing) | set(cuisines_liked))
        if cuisines_disliked is not None:
            existing = pref.cuisines_disliked or []
            pref.cuisines_disliked = list(set(existing) | set(cuisines_disliked))
        if dietary_restrictions is not None:
            existing = pref.dietary_restrictions or []
            pref.dietary_restrictions = list(set(existing) | set(dietary_restrictions))
        if price_range is not None:
            pref.price_range = price_range
        if liked_place_ids is not None:
            existing = pref.liked_place_ids or []
            pref.liked_place_ids = list(set(existing) | set(liked_place_ids))
        if disliked_place_ids is not None:
            existing = pref.disliked_place_ids or []
            pref.disliked_place_ids = list(set(existing) | set(disliked_place_ids))

        session.commit()
    return {"status": "ok", "user_id": user_id}


def get_preferences(user_id: str) -> dict[str, Any]:
    """Retrieve the stored preferences for a user.

    Returns an empty preference dict if the user has no stored preferences.
    """
    with get_session() as session:
        pref = session.query(Preference).filter_by(user_id=user_id).first()
        if pref is None:
            return {
                "user_id": user_id,
                "cuisines_liked": [],
                "cuisines_disliked": [],
                "dietary_restrictions": [],
                "price_range": None,
                "liked_place_ids": [],
                "disliked_place_ids": [],
            }
        return {
            "user_id": user_id,
            "cuisines_liked": pref.cuisines_liked or [],
            "cuisines_disliked": pref.cuisines_disliked or [],
            "dietary_restrictions": pref.dietary_restrictions or [],
            "price_range": pref.price_range,
            "liked_place_ids": pref.liked_place_ids or [],
            "disliked_place_ids": pref.disliked_place_ids or [],
        }


# ---------------------------------------------------------------------------
# Claude tool schemas
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "save_preference",
        "description": (
            "Save or update food/restaurant preferences for the current user. "
            "Only pass the fields you want to update; omit the rest."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "Unique user identifier"},
                "cuisines_liked": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Cuisine types the user enjoys, e.g. ['Japanese', 'Italian']",
                },
                "cuisines_disliked": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Cuisine types the user dislikes",
                },
                "dietary_restrictions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Dietary restrictions, e.g. ['vegan', 'gluten-free']",
                },
                "price_range": {
                    "type": "string",
                    "enum": ["$", "$$", "$$$", "$$$$"],
                    "description": "Preferred price range",
                },
                "liked_place_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Google Place IDs the user has liked",
                },
                "disliked_place_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Google Place IDs the user has disliked",
                },
            },
            "required": ["user_id"],
        },
    },
    {
        "name": "get_preferences",
        "description": "Retrieve the stored food/restaurant preferences for the current user.",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "Unique user identifier"},
            },
            "required": ["user_id"],
        },
    },
]
