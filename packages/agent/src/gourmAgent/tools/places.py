"""Google Places API tool definitions for the Claude agent."""

from __future__ import annotations

import os
from typing import Any

import googlemaps

_client: googlemaps.Client | None = None


def _get_client() -> googlemaps.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_PLACES_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_PLACES_API_KEY environment variable is not set")
        _client = googlemaps.Client(key=api_key)
    return _client


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def search_restaurants(query: str, location: str, radius: int = 5000) -> list[dict[str, Any]]:
    """Search for restaurants using the Google Places Text Search API.

    Args:
        query: Free-text query (e.g. "spicy ramen").
        location: Human-readable location string (e.g. "New York, NY").
        radius: Search radius in metres (default 5 km).

    Returns:
        List of up to 10 place dicts with keys: place_id, name, address,
        rating, price_level, types, location.
    """
    client = _get_client()

    # Geocode the location string to lat/lng
    geocode_result = client.geocode(location)
    if not geocode_result:
        return []
    latlng = geocode_result[0]["geometry"]["location"]

    results = client.places(
        query=f"restaurant {query}",
        location=latlng,
        radius=radius,
        type="restaurant",
    )

    places = []
    for place in results.get("results", [])[:10]:
        places.append(
            {
                "place_id": place.get("place_id"),
                "name": place.get("name"),
                "address": place.get("formatted_address"),
                "rating": place.get("rating"),
                "price_level": place.get("price_level"),  # 0-4
                "types": place.get("types", []),
                "location": place.get("geometry", {}).get("location"),
            }
        )
    return places


def get_details(place_id: str) -> dict[str, Any]:
    """Fetch detailed information for a single place.

    Args:
        place_id: Google Places place_id.

    Returns:
        Dict with name, address, phone, website, rating, price_level,
        opening_hours, reviews, url.
    """
    client = _get_client()
    fields = [
        "name",
        "formatted_address",
        "formatted_phone_number",
        "website",
        "rating",
        "price_level",
        "opening_hours",
        "reviews",
        "url",
    ]
    result = client.place(place_id=place_id, fields=fields)
    return result.get("result", {})


# ---------------------------------------------------------------------------
# Claude tool schemas
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_restaurants",
        "description": (
            "Search for restaurants near a location using a free-text query. "
            "Returns up to 10 results with name, address, rating, and price level."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query, e.g. 'spicy ramen' or 'vegetarian Italian'",
                },
                "location": {
                    "type": "string",
                    "description": "City or address to search near, e.g. 'San Francisco, CA'",
                },
                "radius": {
                    "type": "integer",
                    "description": "Search radius in metres (default 5000)",
                    "default": 5000,
                },
            },
            "required": ["query", "location"],
        },
    },
    {
        "name": "get_details",
        "description": "Fetch detailed information (hours, phone, website, reviews) for a restaurant by its place_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "place_id": {
                    "type": "string",
                    "description": "Google Places place_id returned by search_restaurants",
                },
            },
            "required": ["place_id"],
        },
    },
]
