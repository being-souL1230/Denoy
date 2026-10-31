"""llm.py: Multi-provider AI interface optimized for FREE AI tiers.
Primary Free Provider: Groq (Ultra-fast, 100% free API tier with Llama-3.3-70B / Llama-3.1-8B).
Fallback Providers: Google Gemini free tier, OpenAI-compatible, or Offline Mock mode.

Features:
  - Native Groq support (https://api.groq.com/openai/v1)
  - Temperature 0.0 for deterministic, reliable evidence extraction
  - Rate-limit defense (HTTP 429 auto-retry with exponential backoff for Groq free tier)
  - Disk-based caching (.cache/llm_cache.json) for instant re-runs and 0 token usage
  - Resilient JSON parsing with markdown code-fence removal and regex fallback
"""
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

def load_env(path: str = ".env"):
    """Load environment variables from .env using pure standard library (no external dependency)."""
    env_file = Path(path)
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k and k not in os.environ:
                        os.environ[k] = v

load_env()

CACHE_DIR = Path(".cache")
CACHE_FILE = CACHE_DIR / "llm_cache.json"

# Provider Keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()

# Configuration
MOCK_ENV = os.getenv("MOCK_LLM", "")
MOCK = MOCK_ENV == "1" if MOCK_ENV else (not GROQ_API_KEY and not GEMINI_API_KEY and not OPENAI_API_KEY)

GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

# Default free model on Groq is openai/gpt-oss-120b (supported and verified)
DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
LLM_MODEL = os.getenv("GROQ_MODEL") or os.getenv("LLM_MODEL", DEFAULT_GROQ_MODEL)


def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def _call_groq(prompt: str, system: str = "", as_json: bool = True) -> str:
    """Call free Groq API (OpenAI-compatible) with rate limit handling."""
    model = LLM_MODEL or DEFAULT_GROQ_MODEL
    url = f"{GROQ_BASE_URL}/chat/completions"

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.0,
    }
    if as_json:
        payload["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "User-Agent": "DigitalDarkSpot/1.0",
        },
        method="POST"
    )

    max_attempts = 4
    for attempt in range(max_attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                choices = res_data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                return "{}"
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8")
            except Exception:
                pass

            # Handle rate-limit (HTTP 429) on Groq free tier
            if e.code == 429 and attempt < max_attempts - 1:
                wait_sec = 2 * (attempt + 1)
                print(f"[Groq Free Tier] Rate limit (429) hit. Pausing {wait_sec}s before retry...")
                time.sleep(wait_sec)
                continue
            
            # If invalid json format param, retry without response_format
            if e.code == 400 and as_json and "response_format" in error_body:
                return _call_groq(prompt, system, as_json=False)

            print(f"[Error] Groq API returned HTTP {e.code}: {error_body}")
            raise RuntimeError(f"Groq API error ({e.code}): {error_body}") from e
        except urllib.error.URLError as e:
            if attempt < max_attempts - 1:
                time.sleep(1)
                continue
            raise RuntimeError(f"Groq network error: {e}") from e

    return "{}"


def _call_gemini(prompt: str, system: str = "") -> str:
    """Call Google Gemini free tier directly via HTTPS."""
    model = LLM_MODEL or "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"

    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTION: {system}"}]})
        contents.append({"role": "model", "parts": [{"text": "Understood."}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 2048,
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        candidates = res_data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "")
        return "{}"


def _call_openai_generic(prompt: str, system: str = "") -> str:
    """Generic OpenAI-compatible caller."""
    model = LLM_MODEL or "gpt-4o-mini"
    url = f"{OPENAI_BASE_URL}/chat/completions"

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.0,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        choices = res_data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return "{}"


def call_llm(prompt: str, system: str = "") -> str:
    """Send prompt to LLM with caching and free-tier fallback."""
    provider_name = "mock"
    if not MOCK:
        if GROQ_API_KEY:
            provider_name = f"groq:{LLM_MODEL or DEFAULT_GROQ_MODEL}"
        elif GEMINI_API_KEY:
            provider_name = f"gemini:{LLM_MODEL or 'gemini-1.5-flash'}"
        elif OPENAI_API_KEY:
            provider_name = f"openai:{LLM_MODEL or 'gpt-4o-mini'}"

    cache_key = hashlib.sha256(f"{prompt}::{system}::{provider_name}".encode("utf-8")).hexdigest()
    cache = _load_cache()
    if cache_key in cache:
        return cache[cache_key]

    reply = ""
    if MOCK or (not GROQ_API_KEY and not GEMINI_API_KEY and not OPENAI_API_KEY):
        from .mock_llm import mock_response
        reply = mock_response(prompt)
    elif GROQ_API_KEY:
        reply = _call_groq(prompt, system)
    elif GEMINI_API_KEY:
        reply = _call_gemini(prompt, system)
    elif OPENAI_API_KEY:
        reply = _call_openai_generic(prompt, system)


    cache[cache_key] = reply
    _save_cache(cache)
    return reply


def _parse_json(raw: str):
    """Strip markdown backticks, handle edge whitespace, and extract valid JSON."""
    if not raw:
        return None
    raw = raw.strip()
    fence = chr(96) * 3
    raw = re.sub(r"^" + fence + r"(?:json)?\s*", "", raw).strip()
    raw = re.sub(r"\s*" + fence + r"$", "", raw).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Search for outermost balanced or greedy JSON block
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None


def call_llm_json(prompt: str, system: str = "", retries: int = 2):
    """Call model and safely parse JSON with retry logic."""
    for attempt in range(retries + 1):
        raw = call_llm(prompt, system)
        data = _parse_json(raw)
        if data is not None and isinstance(data, (dict, list)):
            return data
        time.sleep(0.5)
    return None
