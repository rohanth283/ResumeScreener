import json
import os
import re
from typing import Any

PROMPT_TEMPLATE = """You are an expert technical recruiter. Analyse the resume against the job description below.

Return ONLY a valid JSON object with these exact fields:
- match_score: integer 0–100 representing overall fit
- summary: string of exactly two sentences summarising the assessment
- strengths: array of exactly 3 strings describing where the candidate matches well
- improvements: array of exactly 3 strings describing gaps or areas to improve

Do not include any explanation, markdown, or extra text outside the JSON.

JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}"""


def build_prompt(job_description: str, resume_text: str) -> str:
    return PROMPT_TEMPLATE.format(
        job_description=job_description.strip(),
        resume_text=resume_text.strip(),
    )


def _extract_json(text: str) -> dict[str, Any]:
    """Parse JSON from model output, handling markdown fences."""
    cleaned = text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _validate_result(data: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalise the screening result."""
    required = ("match_score", "summary", "strengths", "improvements")
    missing = [field for field in required if field not in data]
    if missing:
        raise ValueError(f"Model response missing fields: {', '.join(missing)}")

    score = int(data["match_score"])
    if not 0 <= score <= 100:
        raise ValueError("match_score must be between 0 and 100.")

    summary = str(data["summary"]).strip()
    if not summary:
        raise ValueError("summary must not be empty.")

    strengths = [str(s).strip() for s in data["strengths"]]
    improvements = [str(s).strip() for s in data["improvements"]]

    if len(strengths) != 3:
        raise ValueError("strengths must contain exactly 3 items.")
    if len(improvements) != 3:
        raise ValueError("improvements must contain exactly 3 items.")

    return {
        "match_score": score,
        "summary": summary,
        "strengths": strengths,
        "improvements": improvements,
    }


def _get_gemini_api_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError(
            "No API key configured. Set GEMINI_API_KEY from Google AI Studio."
        )
    return api_key


DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"


def _format_gemini_error(exc: Exception) -> str:
    message = str(exc)
    model = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    if "429" in message or "quota" in message.lower():
        return (
            f"Gemini API quota exceeded for model '{model}'. "
            "Wait a minute and retry, try GEMINI_MODEL=gemini-2.5-flash-lite in .env, "
            "or enable billing at https://ai.google.dev/"
        )
    if "404" in message or "not found" in message.lower():
        return (
            f"Gemini model '{model}' is not available for your API key. "
            "Set GEMINI_MODEL to gemini-2.5-flash-lite or gemini-2.5-flash in .env."
        )
    return f"AI API call failed: {message}"


def _call_gemini(prompt: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=_get_gemini_api_key())
    model_name = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )
    return response.text or ""


def screen_resume(job_description: str, resume_text: str) -> dict[str, Any]:
    """Build prompt, call LLM, and return validated screening result."""
    prompt = build_prompt(job_description, resume_text)

    try:
        raw_response = _call_gemini(prompt)
    except Exception as exc:
        raise RuntimeError(_format_gemini_error(exc)) from exc

    try:
        parsed = _extract_json(raw_response)
        return _validate_result(parsed)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise ValueError(f"Failed to parse model response: {exc}") from exc
