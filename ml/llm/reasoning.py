"""
Reasoning engine — the ONLY place where the LLM is called.

Contains three reasoning capabilities:
  1. Documentation Generator  — explains what a file does
  2. Change Reasoner          — explains impact of changes
  3. Suggestion Reasoner      — suggests improvements

All three are combined into a single LLM call that returns structured JSON.

LLM is NEVER used for structural extraction — only for reasoning.
"""

import json
import logging
from typing import Optional

from config import settings
from models.schemas import ReasoningOutput, PushType, StructuredContext
import google.generativeai as genai

logger = logging.getLogger(__name__)

# Lazy-loaded Gemini client status
_llm_client_configured = False


def _configure_client():
    """Lazily configure the Gemini native client."""
    global _llm_client_configured
    if not _llm_client_configured:
        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not set. Using stub reasoning.")
            return False
        
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            _llm_client_configured = True
            logger.info("Gemini Native SDK configured successfully")
        except Exception as e:
            logger.warning(f"Failed to init Gemini client: {e}. Using stub.")
            return False
    return _llm_client_configured


# ═══════════════════════════════════════════════════════════════════
# System prompt — instructs the LLM on its role
# ═══════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are an architecture intelligence engine that analyzes code files within a software system.

You will receive structured context about a code file including:
- The source code (possibly truncated)
- Parsed structure (functions, classes, imports, calls)
- Dependency graph relationships (what depends on it, what it depends on)
- Change diff (if this is an update, what changed structurally)
- Semantically related files

Your job is to produce a JSON response with exactly these fields:

{
  "documentation": "A clear, concise description of what this file does, its purpose, and its role in the system architecture. 2-4 paragraphs.",
  "change_explanation": "If this is an update, explain what changed and why it matters. If new file, leave empty string.",
  "suggestions": ["Actionable improvement suggestion 1", "Suggestion 2", ...],
  "impact_analysis": "Analysis of how changes to this file could affect dependent files/systems. Focus on the dependency graph relationships provided.",
  "risk_level": "low | medium | high"
}

Rules:
- Be precise and technical
- Reference specific function/class names from the parsed structure
- Consider the dependency graph when assessing impact and risk
- Suggestions should be actionable, not generic
- Risk is "high" if many files depend on this one, or if it handles auth/payments/data
- Risk is "medium" if it has moderate dependencies or handles business logic
- Risk is "low" for utility files, configs, or leaf nodes with no dependents
- ALWAYS return valid JSON, nothing else
"""


class ReasoningEngine:
    """
    Calls the LLM exactly once per push with structured context.
    Returns documentation, change explanation, suggestions, impact analysis.
    """

    def reason(
        self,
        context: StructuredContext,
        formatted_prompt: str,
    ) -> ReasoningOutput:
        """
        Run all reasoning modules in a single LLM call.

        Args:
            context: The structured context object
            formatted_prompt: Human-readable formatted prompt from ContextBuilder

        Returns:
            ReasoningOutput with documentation, explanations, suggestions
        """
        if not _configure_client():
            return self._stub_reasoning(context)

        try:
            model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                system_instruction=SYSTEM_PROMPT,
                generation_config=genai.types.GenerationConfig(
                    temperature=settings.LLM_TEMPERATURE,
                    max_output_tokens=settings.LLM_MAX_TOKENS,
                    response_mime_type="application/json",
                )
            )

            # Generate content
            response = model.generate_content(formatted_prompt)

            # Extract text from response
            raw_text = response.text.strip()

            # Parse JSON from response (handle markdown code blocks)
            json_str = self._extract_json(raw_text)
            data = json.loads(json_str)

            return ReasoningOutput(
                documentation=data.get("documentation", ""),
                change_explanation=data.get("change_explanation", ""),
                suggestions=data.get("suggestions", []),
                impact_analysis=data.get("impact_analysis", ""),
                risk_level=data.get("risk_level", "low"),
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON response: {e}")
            return self._fallback_reasoning(context, raw_text)
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            # Surface the error message so callers can see what happened
            return ReasoningOutput(
                documentation=self._stub_reasoning(context).documentation,
                change_explanation="",
                suggestions=[f"LLM call failed: {e}"],
                impact_analysis=self._stub_reasoning(context).impact_analysis,
                risk_level="medium",
            )

    def chat(self, question: str, context: str) -> str:
        """Answer arbitrary architecture questions using provided context."""
        if not _configure_client():
            return f"Stub answer: based on {len(context)} chars of context, here is your answer to '{question}'."

        try:
            model = genai.GenerativeModel(
                model_name=settings.GEMINI_MODEL,
                system_instruction="You are a software architecture expert Assistant answering questions based strictly on the provided graph and vector database context. Use specific file/function references when applicable. Do not make up file names.",
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=2000,
                )
            )

            prompt = f"Context data:\n{context}\n\nQuestion: {question}"
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            logger.error(f"LLM chat call failed: {e}")
            return f"Error generating answer: {e}"

    # ══════════════════════════════════════════════════
    # Helpers
    # ══════════════════════════════════════════════════

    @staticmethod
    def _extract_json(text: str) -> str:
        """Extract JSON from LLM response, handling markdown code blocks."""
        # Try to find JSON in code blocks
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return text[start:end].strip()
        if "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return text[start:end].strip()
        # Try raw JSON
        if text.startswith("{"):
            return text
        # Find first { to last }
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1:
            return text[first_brace:last_brace + 1]
        return text

    @staticmethod
    def _stub_reasoning(context: StructuredContext) -> ReasoningOutput:
        """
        Generate reasonable output without calling the LLM.
        Used when Anthropic API is unavailable.
        """
        func_names = ", ".join(context.functions) if context.functions else "none"
        class_names = ", ".join(context.classes) if context.classes else "none"
        import_names = ", ".join(context.imports) if context.imports else "none"

        doc = (
            f"**{context.file_name}** is a {context.language} source file.\n\n"
            f"It defines the following functions: {func_names}.\n"
            f"Classes: {class_names}.\n"
            f"It imports: {import_names}."
        )

        change_explanation = ""
        if context.push_type == PushType.UPDATE and context.diff and context.diff.has_changes:
            parts = []
            if context.diff.added_functions:
                parts.append(f"Added functions: {', '.join(context.diff.added_functions)}")
            if context.diff.removed_functions:
                parts.append(f"Removed functions: {', '.join(context.diff.removed_functions)}")
            if context.diff.modified_functions:
                parts.append(f"Modified functions: {', '.join(context.diff.modified_functions)}")
            change_explanation = ". ".join(parts) + "." if parts else ""

        suggestions = [
            "Consider adding docstrings/comments to all public functions.",
            "Review error handling in external calls.",
        ]

        # Simple risk heuristic
        risk = "low"
        if len(context.depended_on_by) > 3:
            risk = "high"
        elif len(context.depended_on_by) > 1:
            risk = "medium"

        impact = ""
        if context.depended_on_by:
            impact = f"This file is used by {len(context.depended_on_by)} other file(s): {', '.join(context.depended_on_by)}. Changes may cascade."

        return ReasoningOutput(
            documentation=doc,
            change_explanation=change_explanation,
            suggestions=suggestions,
            impact_analysis=impact,
            risk_level=risk,
        )

    @staticmethod
    def _fallback_reasoning(
        context: StructuredContext,
        raw_text: str,
    ) -> ReasoningOutput:
        """Fallback when JSON parsing fails — use the raw text as documentation."""
        return ReasoningOutput(
            documentation=raw_text[:2000],
            change_explanation="",
            suggestions=["LLM response was not valid JSON. Review output format."],
            impact_analysis="",
            risk_level="medium",
        )
