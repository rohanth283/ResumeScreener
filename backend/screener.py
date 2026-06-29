import json
import os
import re
import requests
import httpx
from typing import Any

PROMPT_TEMPLATE = """You are a senior Technical Recruiter, Talent Acquisition Specialist, and ATS Evaluation Engine.

Your task is to evaluate a candidate's resume against a given Job Description exactly as an enterprise-grade ATS would.

# INPUTS

## JOB DESCRIPTION

{job_description}

## CANDIDATE RESUME

{resume_text}

# EVALUATION OBJECTIVE

Determine how well the candidate fits the role by analyzing:

• Required skills
• Preferred skills
• Years of experience
• Domain expertise
• Educational qualifications
• Certifications
• Projects
• Leadership experience
• Industry exposure
• Career progression
• Technical depth

Only use information explicitly stated in the resume.

Do NOT infer or assume skills, certifications, or experiences that are not mentioned.

Missing information should be treated as unavailable rather than negative.

# SCORING RUBRIC

Technical Skills Match ........ 40%
Relevant Experience ........... 25%
Education Fit ................ 10%
Projects Relevance ........... 10%
Certifications ............... 5%
Industry Alignment ........... 10%

Total Score = 100

# SCORING RULES

Mandatory skills missing:
* Deduct heavily

Preferred skills missing:
* Deduct slightly

Related technologies:
* Count as partial matches

Examples:
PyTorch ≈ Deep Learning
FastAPI ≈ REST API Development
TensorFlow ≈ Machine Learning
PostgreSQL ≈ Relational Databases
Docker ≈ Containerization
Kubernetes ≈ Container Orchestration
AWS ≈ Cloud Infrastructure
GCP ≈ Cloud Platforms
React ≈ Frontend Development
Node.js ≈ Backend APIs

# ANALYSIS STEPS

Step 1: Extract candidate attributes.
Step 2: Identify mandatory requirements.
Step 3: Identify preferred requirements.
Step 4: Compare candidate profile with role requirements.
Step 5: Calculate weighted scores.
Step 6: Generate explanation for every deduction.
Step 7: Provide hiring recommendation.

# OUTPUT FORMAT

Return ONLY a valid JSON object. Do not include any explanations, markdown, or text outside the JSON.
The JSON object must contain exactly the following structure:
{{
  "candidate_name": "extracted candidate name (string)",
  "candidate_email": "extracted candidate email (string)",
  "overall_score": 0, // overall score based on the rubric above (integer)
  "recommendation": "Strong Match | Good Match | Potential Match | Weak Match | Reject",
  "scores": {{
    "skills": 0,
    "experience": 0,
    "education": 0,
    "projects": 0,
    "certifications": 0,
    "industry_alignment": 0
  }},
  "matched_skills": ["list", "of", "skills"],
  "missing_skills": ["list", "of", "skills"],
  "related_skills_found": ["list", "of", "skills"],
  "experience_required": "brief description of experience required (string)",
  "experience_candidate": "brief description of candidate experience (string)",
  "education_match": "Excellent | Good | Partial | Poor",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "concerns": ["concern 1", "concern 2", "concern 3"],
  "key_projects": ["project 1", "project 2"],
  "certifications_found": ["cert 1", "cert 2"],
  "deductions": [
    {{
      "reason": "reason for deduction",
      "points_lost": 0
    }}
  ],
  "summary": "brief summary of candidate match (string)",
  "decision_reasoning": "brief explanation of decision (string)",
  "interview_questions": [
    "question 1",
    "question 2",
    "question 3"
  ]
}}
"""


def build_prompt(job_description: str, resume_text: str, priority_skills: str = "") -> str:
    prompt = PROMPT_TEMPLATE.format(
        job_description=job_description.strip(),
        resume_text=resume_text.strip(),
    )
    if priority_skills and priority_skills.strip():
        prompt += f"\n\nPRIORITY SKILLS (INTEGRATE INTO MUST-HAVE COMPETENCIES IN SCORING): {priority_skills.strip()}"
        prompt += "\nIMPORTANT: These priority skills should be prioritized when identifying the Top 3 Must-Have requirements and scoring Competency Alignment."
    return prompt


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
    required = (
        "candidate_name",
        "overall_score",
        "recommendation",
        "scores",
        "matched_skills",
        "missing_skills",
        "related_skills_found",
        "experience_required",
        "experience_candidate",
        "education_match",
        "strengths",
        "concerns",
        "key_projects",
        "certifications_found",
        "deductions",
        "summary",
        "decision_reasoning",
        "interview_questions"
    )
    missing = [field for field in required if field not in data]
    if missing:
        raise ValueError(f"Model response missing fields: {', '.join(missing)}")

    name = str(data["candidate_name"]).strip()
    if not name:
        name = "Unknown Candidate"

    email = str(data.get("candidate_email", "")).strip().lower()
    if not email or "@" not in email or "." not in email:
        email = "unknown@example.com"

    score = int(data["overall_score"])
    if not 0 <= score <= 100:
        raise ValueError("overall_score must be between 0 and 100.")

    summary_str = str(data["summary"]).strip()
    if not summary_str:
        summary_str = "No summary provided."

    strengths = [str(s).strip() for s in data["strengths"]]
    concerns = [str(c).strip() for c in data["concerns"]]
    key_projects = [str(p).strip() for p in data["key_projects"]]
    certifications_found = [str(c).strip() for c in data["certifications_found"]]
    interview_questions = [str(q).strip() for q in data["interview_questions"]]

    # Normalize deductions list
    deductions = []
    for d in data["deductions"]:
        if isinstance(d, dict) and "reason" in d:
            deductions.append({
                "reason": str(d["reason"]).strip(),
                "points_lost": int(d.get("points_lost", 0))
            })

    # Sub-scores validation
    scores = data["scores"]
    sub_score_keys = ("skills", "experience", "education", "projects", "certifications", "industry_alignment")
    normalized_scores = {}
    for k in sub_score_keys:
        normalized_scores[k] = int(scores.get(k, 0))

    skills_matched = [str(s).strip() for s in data["matched_skills"] if str(s).strip()]
    skills_missing = [str(s).strip() for s in data["missing_skills"] if str(s).strip()]

    # Map to legacy improvements array
    improvements = [d["reason"] for d in deductions]
    if not improvements:
        improvements = concerns[:3]
    while len(improvements) < 3:
        improvements.append("No major improvement areas noted.")
    improvements = improvements[:3]

    # Map legacy strengths to exactly 3 items
    legacy_strengths = strengths[:]
    while len(legacy_strengths) < 3:
        legacy_strengths.append("No specific strength highlighted.")
    legacy_strengths = legacy_strengths[:3]

    return {
        # Legacy fields for DB compatibility
        "candidate_name": name,
        "candidate_email": email,
        "match_score": score,
        "summary": [summary_str],
        "strengths": legacy_strengths,
        "improvements": improvements,
        "skills_matched": skills_matched,
        "skills_missing": skills_missing,

        # New rich evaluation format fields
        "overall_score": score,
        "recommendation": str(data["recommendation"]).strip(),
        "scores": normalized_scores,
        "matched_skills": skills_matched,
        "missing_skills": skills_missing,
        "related_skills_found": [str(s).strip() for s in data["related_skills_found"]],
        "experience_required": str(data["experience_required"]).strip(),
        "experience_candidate": str(data["experience_candidate"]).strip(),
        "education_match": str(data["education_match"]).strip(),
        "concerns": concerns,
        "key_projects": key_projects,
        "certifications_found": certifications_found,
        "deductions": deductions,
        "summary_text": summary_str,
        "decision_reasoning": str(data["decision_reasoning"]).strip(),
        "interview_questions": interview_questions
    }


def _get_groq_api_key() -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError(
            "No API key configured. Set GROQ_API_KEY in environment variables."
        )
    return api_key


DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"


def _format_groq_error(exc: Exception) -> str:
    message = str(exc)
    model = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)
    if "401" in message:
        return "Groq API key is invalid or unauthorized. Please check your GROQ_API_KEY."
    if "429" in message or "limit" in message.lower():
        return (
            f"Groq API rate limit reached for model '{model}'. "
            "Please wait a moment and try again."
        )
    return f"Groq AI API call failed: {message}"


async def _call_groq(prompt: str) -> str:
    api_key = _get_groq_api_key()
    model_name = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"}
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload
        )
    
    if response.status_code != 200:
        raise RuntimeError(f"Groq API returned error status {response.status_code}: {response.text}")
        
    result = response.json()
    try:
        return result["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as exc:
        raise ValueError(f"Unexpected response structure from Groq: {result}") from exc


async def screen_resume(job_description: str, resume_text: str, priority_skills: str = "") -> dict[str, Any]:
    """Build prompt, call LLM, and return validated screening result."""
    if not os.getenv("GROQ_API_KEY"):
        # Local development/testing fallback when API key is not set
        name = "Unknown Candidate"
        email = "unknown@example.com"
        for line in resume_text.splitlines():
            if "name" in line.lower() or "candidate" in line.lower():
                parts = line.split(":")
                if len(parts) > 1:
                    name = parts[1].strip()
            if "email" in line.lower():
                parts = line.split(":")
                if len(parts) > 1:
                    email = parts[1].strip()
        
        return {
            # Legacy fields for DB compatibility
            "candidate_name": name,
            "candidate_email": email,
            "match_score": 85,
            "summary": ["Mocked assessment summary text detailing candidate fit."],
            "strengths": ["Demonstrated key technical skills.", "Clear resume formatting.", "Good experience level."],
            "improvements": ["Missing containerization/Docker expertise", "Unquantified project results in recent role", "No major improvement areas noted."],
            "skills_matched": ["Python", "React", "FastAPI"],
            "skills_missing": ["Docker"],

            # New rich evaluation format fields
            "overall_score": 85,
            "recommendation": "Good Match",
            "scores": {
                "skills": 85,
                "experience": 80,
                "education": 90,
                "projects": 80,
                "certifications": 100,
                "industry_alignment": 90
            },
            "matched_skills": ["Python", "React", "FastAPI"],
            "missing_skills": ["Docker"],
            "related_skills_found": ["Django", "Flask"],
            "experience_required": "3+ years of web application development",
            "experience_candidate": "4 years of full-stack development experience",
            "education_match": "Good",
            "concerns": ["Limited experience with container orchestration tools like Kubernetes."],
            "key_projects": ["Portfolio Management System using React & FastAPI", "Automated email outreach tool using Python"],
            "certifications_found": ["AWS Certified Developer - Associate"],
            "deductions": [
                {
                    "reason": "Missing containerization/Docker expertise",
                    "points_lost": 10
                },
                {
                    "reason": "Unquantified project results in recent role",
                    "points_lost": 5
                }
            ],
            "summary_text": "Mocked assessment summary text detailing candidate fit.",
            "decision_reasoning": "The candidate has strong matching backend and frontend skills with React and Python. Lacks containerization expertise which is a minor deduction, but overall a solid consider.",
            "interview_questions": [
                "Can you describe your experience implementing FastAPI endpoints?",
                "How do you handle state management in complex React applications?",
                "What is your approach to optimizing relational database queries?"
            ]
        }

    prompt = build_prompt(job_description, resume_text, priority_skills)

    try:
        raw_response = await _call_groq(prompt)
    except Exception as exc:
        raise RuntimeError(_format_groq_error(exc)) from exc

    try:
        parsed = _extract_json(raw_response)
        return _validate_result(parsed)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise ValueError(f"Failed to parse model response: {exc}") from exc


import asyncio
import hashlib
import math

async def get_embedding(text: str) -> list[float]:
    """
    Get 3072-dimensional vector embedding for the given text using gemini-embedding-001.
    Includes automatic retries (up to 3) with exponential backoff on rate limits (429).
    Falls back to a deterministic sha256-based mock vector if GEMINI_API_KEY is not configured.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        # Fallback/mock embedding for testing or if no key is configured
        # Return a deterministic mock vector of length 3072
        h = hashlib.sha256(text.encode("utf-8")).digest()
        mock_vec = []
        for i in range(3072):
            val = ((h[i % len(h)] * (i + 1)) % 1000) / 1000.0 - 0.5
            mock_vec.append(val)
        return mock_vec

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
    payload = {
        "content": {
            "parts": [{
                "text": text
            }]
        }
    }
    
    max_retries = 3
    delay = 1.0  # initial delay in seconds
    
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload)
                
                # Check for rate limiting
                if response.status_code == 429:
                    if attempt < max_retries:
                        print(f"Embedding API rate limited (429). Retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        delay *= 2.0
                        continue
                    else:
                        raise RuntimeError("Embedding API rate limited. Max retries exceeded.")
                
                if response.status_code != 200:
                    raise RuntimeError(f"Embedding API returned status {response.status_code}: {response.text}")
                
                res_data = response.json()
                return res_data["embedding"]["values"]
        except Exception as e:
            if attempt < max_retries:
                print(f"Error calling Embedding API: {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay *= 2.0
            else:
                print(f"Failed to fetch embedding after {max_retries} retries: {e}")
                # Fallback to mock embedding on final failure so that it doesn't fail the whole screening process
                h = hashlib.sha256(text.encode("utf-8")).digest()
                mock_vec = []
                for i in range(3072):
                    val = ((h[i % len(h)] * (i + 1)) % 1000) / 1000.0 - 0.5
                    mock_vec.append(val)
                return mock_vec
    
    return []

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """
    Calculate the cosine similarity between two float vectors.
    Returns a float between -1.0 and 1.0 (or 0.0 on error).
    """
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a * a for a in v1))
    magnitude2 = math.sqrt(sum(b * b for b in v2))
    if magnitude1 == 0.0 or magnitude2 == 0.0:
        return 0.0
    return dot_product / (magnitude1 * magnitude2)

