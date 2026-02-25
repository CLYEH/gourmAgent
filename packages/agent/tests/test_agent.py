"""Unit tests for the gourmAgent Python package.

Google Places and Anthropic API calls are mocked so tests run without real API keys.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from gourmAgent.memory.store import init_db
from gourmAgent.tools import prefs as prefs_tools


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def in_memory_db(tmp_path, monkeypatch):
    """Point SQLAlchemy at a fresh in-memory SQLite DB for each test."""
    db_url = f"sqlite:///{tmp_path / 'test.db'}"
    monkeypatch.setenv("DATABASE_URL", db_url)

    # Re-import store so the engine picks up the patched env var
    import importlib
    import gourmAgent.memory.store as store_module
    importlib.reload(store_module)

    # Also reload tools that import from store
    import gourmAgent.tools.prefs as prefs_module
    importlib.reload(prefs_module)

    store_module.init_db()
    yield


# ---------------------------------------------------------------------------
# Preference tool tests
# ---------------------------------------------------------------------------

class TestPreferenceTools:
    def test_get_preferences_returns_empty_for_new_user(self):
        from gourmAgent.tools.prefs import get_preferences
        prefs = get_preferences("user_new")
        assert prefs["cuisines_liked"] == []
        assert prefs["price_range"] is None

    def test_save_and_retrieve_preferences(self):
        from gourmAgent.tools.prefs import get_preferences, save_preference
        save_preference(
            user_id="user1",
            cuisines_liked=["Japanese", "Korean"],
            price_range="$$",
        )
        prefs = get_preferences("user1")
        assert "Japanese" in prefs["cuisines_liked"]
        assert "Korean" in prefs["cuisines_liked"]
        assert prefs["price_range"] == "$$"

    def test_save_preference_merges_lists(self):
        from gourmAgent.tools.prefs import get_preferences, save_preference
        save_preference("user2", cuisines_liked=["Italian"])
        save_preference("user2", cuisines_liked=["Mexican"])
        prefs = get_preferences("user2")
        assert "Italian" in prefs["cuisines_liked"]
        assert "Mexican" in prefs["cuisines_liked"]

    def test_save_preference_partial_update(self):
        from gourmAgent.tools.prefs import get_preferences, save_preference
        save_preference("user3", cuisines_liked=["Thai"], price_range="$$$")
        # Only update price_range, cuisines_liked should be untouched
        save_preference("user3", price_range="$$")
        prefs = get_preferences("user3")
        assert prefs["price_range"] == "$$"
        assert "Thai" in prefs["cuisines_liked"]


# ---------------------------------------------------------------------------
# Places tool tests (mocked)
# ---------------------------------------------------------------------------

MOCK_GEOCODE = [{"geometry": {"location": {"lat": 37.7749, "lng": -122.4194}}}]

MOCK_PLACES_RESULT = {
    "results": [
        {
            "place_id": "ChIJtest1",
            "name": "Ramen House",
            "formatted_address": "123 Main St, San Francisco, CA",
            "rating": 4.5,
            "price_level": 2,
            "types": ["restaurant", "food"],
            "geometry": {"location": {"lat": 37.77, "lng": -122.41}},
        },
        {
            "place_id": "ChIJtest2",
            "name": "Spicy Noodles",
            "formatted_address": "456 Market St, San Francisco, CA",
            "rating": 4.2,
            "price_level": 1,
            "types": ["restaurant", "food"],
            "geometry": {"location": {"lat": 37.78, "lng": -122.42}},
        },
    ]
}


class TestPlacesTools:
    @patch("gourmAgent.tools.places.googlemaps.Client")
    def test_search_restaurants_returns_results(self, MockClient):
        mock_instance = MockClient.return_value
        mock_instance.geocode.return_value = MOCK_GEOCODE
        mock_instance.places.return_value = MOCK_PLACES_RESULT

        # Force re-init of the module-level client
        import gourmAgent.tools.places as places_module
        places_module._client = mock_instance

        results = places_module.search_restaurants("ramen", "San Francisco, CA")
        assert len(results) == 2
        assert results[0]["name"] == "Ramen House"
        assert results[0]["rating"] == 4.5

    @patch("gourmAgent.tools.places.googlemaps.Client")
    def test_get_details_returns_place_info(self, MockClient):
        mock_instance = MockClient.return_value
        mock_instance.place.return_value = {
            "result": {
                "name": "Ramen House",
                "formatted_address": "123 Main St",
                "rating": 4.5,
            }
        }

        import gourmAgent.tools.places as places_module
        places_module._client = mock_instance

        details = places_module.get_details("ChIJtest1")
        assert details["name"] == "Ramen House"


# ---------------------------------------------------------------------------
# Agent run tests (mocked Anthropic + Places)
# ---------------------------------------------------------------------------

class TestAgentRun:
    def _make_text_response(self, text: str):
        """Build a mock Anthropic response that returns a text block."""
        block = MagicMock()
        block.type = "text"
        block.text = text

        response = MagicMock()
        response.stop_reason = "end_turn"
        response.content = [block]
        return response

    @patch("gourmAgent.agent.anthropic.Anthropic")
    def test_agent_returns_response(self, MockAnthropic):
        mock_client = MockAnthropic.return_value
        mock_client.messages.create.return_value = self._make_text_response(
            "Here are 3 great ramen spots in San Francisco!"
        )

        import gourmAgent.agent as agent_module
        agent_module._client = mock_client

        result = agent_module.run(
            user_id="u1",
            message="Find me ramen",
            location="San Francisco, CA",
        )
        assert "ramen" in result["response"].lower() or "spots" in result["response"].lower()
        assert isinstance(result["tool_calls"], list)
