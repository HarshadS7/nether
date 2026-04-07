"""Quick test of the Kimi / Moonshot LLM integration via the reasoning engine.

Run with:  python -m pytest ml/test_llm.py -v -s
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from openai import OpenAI, APIConnectionError, RateLimitError
from config import settings


# ── helpers ──
_requires_llm = pytest.mark.skipif(
    not (settings.LLM_API_KEY and settings.LLM_BASE_URL and settings.LLM_MODEL),
    reason="LLM_API_KEY / LLM_BASE_URL / LLM_MODEL not set in environment",
)


@_requires_llm
def test_raw_openai_client():
    """1. Quick raw OpenAI-compatible client test against the real API."""
    print(f"\nLLM_API_KEY set: yes")
    print(f"LLM_BASE_URL:    {settings.LLM_BASE_URL}")
    print(f"LLM_MODEL:       {settings.LLM_MODEL}")

    client = OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    try:
        resp = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful coding assistant. Reply in 1-2 sentences."},
                {"role": "user", "content": "What language is FastAPI written in?"},
            ],
            temperature=0.6,
            max_tokens=100,
        )
        answer = resp.choices[0].message.content
        print(f"Response: {answer}")
        assert answer, "LLM returned an empty response"
    except RateLimitError as exc:
        pytest.skip(f"LLM rate-limited (quota exceeded) — {exc}")
    except APIConnectionError as exc:
        pytest.fail(f"LLM connection failed — {exc}")


@_requires_llm
def test_reasoning_engine():
    """2. Full reasoning-engine integration test against the real API."""
    from models.schemas import StructuredContext, PushType
    from llm.reasoning import ReasoningEngine

    ctx = StructuredContext(
        file_name="services/auth/login.py",
        language="python",
        push_type=PushType.NEW,
        code_snippet=(
            "def login(username, password):\n"
            "    user = db.find_user(username)\n"
            "    if user and verify_hash(password, user.hash):\n"
            "        return create_jwt(user)\n"
            "    raise AuthError('Invalid credentials')\n"
        ),
        functions=["login"],
        classes=[],
        imports=["db", "verify_hash", "create_jwt", "AuthError"],
        calls=["db.find_user", "verify_hash", "create_jwt", "AuthError"],
        depended_on_by=["routes/auth.py", "middleware/session.py"],
    )

    prompt = (
        f"File: {ctx.file_name}\n"
        f"Language: {ctx.language}\n"
        f"Push type: {ctx.push_type.value}\n\n"
        f"Code:\n{ctx.code_snippet}\n\n"
        f"Functions: {ctx.functions}\n"
        f"Classes: {ctx.classes}\n"
        f"Imports: {ctx.imports}\n"
        f"Calls: {ctx.calls}\n"
        f"Depended on by: {ctx.depended_on_by}\n"
    )

    engine = ReasoningEngine()
    try:
        result = engine.reason(context=ctx, formatted_prompt=prompt)
    except RateLimitError as exc:
        pytest.skip(f"LLM rate-limited (quota exceeded) — {exc}")
        return
    except Exception as exc:
        # If it's a rate-limit wrapped in another exception, still skip
        if "429" in str(exc) or "rate" in str(exc).lower():
            pytest.skip(f"LLM rate-limited — {exc}")
            return
        raise

    print(f"Documentation:\n{result.documentation}\n")
    print(f"Change explanation: {result.change_explanation}")
    print(f"Suggestions: {result.suggestions}")
    print(f"Impact analysis: {result.impact_analysis}")
    print(f"Risk level: {result.risk_level}")
    assert result.documentation, "Reasoning engine returned empty documentation"
    print("\n✓ LLM integration test complete")
