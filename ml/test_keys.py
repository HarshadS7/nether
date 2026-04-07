"""Test that real API keys work against Gemini / OpenAI-compatible endpoints.

Run:  python -m pytest ml/test_keys.py -v -s
"""
import os
import asyncio
import pytest
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")
_base_url = os.getenv("LLM_BASE_URL", "")
_model = os.getenv("LLM_MODEL", "")

_requires_keys = pytest.mark.skipif(
    not _api_key,
    reason="LLM_API_KEY / GEMINI_API_KEY not set in environment",
)


@_requires_keys
def test_moonshot():
    """Validate the OpenAI-compatible route using real API keys."""
    from openai import OpenAI, RateLimitError

    print("\n=== Testing OpenAI/Moonshot/Kimi (Python ML Service) ===")
    print(f"Key Found: Yes (starts with {_api_key[:5]})")
    print(f"Base URL: {_base_url}")
    print(f"Model: {_model}")

    client = OpenAI(api_key=_api_key, base_url=_base_url)
    try:
        response = client.chat.completions.create(
            model=_model,
            messages=[{"role": "user", "content": "Hello! Reply with exactly 'Moonshot OK'."}],
            max_tokens=10,
        )
        result = response.choices[0].message.content.strip()
        print(f"Result: {result}")
        print("[SUCCESS] OpenAI SDK route is WORKING")
        assert result, "Empty response from LLM"
    except RateLimitError as exc:
        pytest.skip(f"Rate-limited — {exc}")
    except Exception as exc:
        if "429" in str(exc):
            pytest.skip(f"Rate-limited — {exc}")
        pytest.fail(f"OpenAI SDK route FAILED: {exc}")


@_requires_keys
def test_gemini():
    """Validate the Gemini native SDK route using real API keys."""
    from google.generativeai import configure, GenerativeModel

    print("\n=== Testing Gemini Native SDK ===")
    print(f"Key Found: Yes (starts with {_api_key[:5]})")

    configure(api_key=_api_key)
    model = GenerativeModel("gemini-2.5-flash")
    try:
        response = model.generate_content("Hello! Reply with exactly 'Gemini OK'.")
        result = response.text.strip()
        print(f"Result: {result}")
        print("[SUCCESS] Gemini Native SDK route is WORKING")
        assert result, "Empty response from Gemini"
    except Exception as exc:
        if "429" in str(exc) or "rate" in str(exc).lower() or "quota" in str(exc).lower():
            pytest.skip(f"Rate-limited — {exc}")
        pytest.fail(f"Gemini SDK route FAILED: {exc}")


if __name__ == "__main__":
    # Allow running directly with `python test_keys.py`
    test_moonshot()
    test_gemini()
