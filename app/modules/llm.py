from __future__ import annotations
from dataclasses import dataclass
from openai import OpenAI, RateLimitError, APIStatusError, APIConnectionError
from app.config import settings
import threading, time, logging

logger = logging.getLogger(__name__)

CIRCUIT_COOLDOWN = 60  # 실패 후 재시도 대기(초)

@dataclass
class _Endpoint:
    tag: str    # 로깅용 식별자
    model: str
    client: OpenAI

# ── 프로바이더별 무료 모델 목록 ──────────────────────────────────────
_ZEN_MODELS = [
    "big-pickle",
    "minimax-m2.5-free",
    "ling-2.6-flash",
    "hy3-preview-free",
    "nemotron-3-super-free",
]
_GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
]
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
]
_OPENROUTER_MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-7b-instruct:free",
]

# ── 런타임 상태 ──────────────────────────────────────────────────────
_endpoints: list[_Endpoint] = []
_rr_idx = 0
_circuit_open_until: dict[str, float] = {}
_lock = threading.Lock()


def _build_endpoints() -> list[_Endpoint]:
    eps: list[_Endpoint] = []

    if settings.zen_api_key:
        c = OpenAI(api_key=settings.zen_api_key, base_url=settings.zen_base_url)
        for m in _ZEN_MODELS:
            eps.append(_Endpoint(f"zen/{m}", m, c))

    if settings.groq_api_key:
        c = OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")
        for m in _GROQ_MODELS:
            eps.append(_Endpoint(f"groq/{m}", m, c))

    if settings.gemini_api_key:
        c = OpenAI(api_key=settings.gemini_api_key,
                   base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        for m in _GEMINI_MODELS:
            eps.append(_Endpoint(f"gemini/{m}", m, c))

    if settings.openrouter_api_key:
        c = OpenAI(api_key=settings.openrouter_api_key, base_url="https://openrouter.ai/api/v1")
        for m in _OPENROUTER_MODELS:
            eps.append(_Endpoint(f"openrouter/{m}", m, c))

    logger.info("LLM endpoints loaded: %d", len(eps))
    return eps


def _get_endpoints() -> list[_Endpoint]:
    global _endpoints
    if not _endpoints:
        _endpoints = _build_endpoints()
    return _endpoints


def _pick() -> _Endpoint | None:
    """라운드로빈으로 사용 가능한 엔드포인트 반환. 모두 차단 시 None."""
    global _rr_idx
    now = time.time()
    eps = _get_endpoints()
    if not eps:
        return None
    with _lock:
        for _ in range(len(eps)):
            ep = eps[_rr_idx % len(eps)]
            _rr_idx += 1
            if _circuit_open_until.get(ep.tag, 0) <= now:
                return ep
    return None


def _trip(tag: str) -> None:
    with _lock:
        _circuit_open_until[tag] = time.time() + CIRCUIT_COOLDOWN
    logger.warning("circuit tripped: %s (%ds cooldown)", tag, CIRCUIT_COOLDOWN)


def chat(prompt: str, system: str = "", model: str | None = None) -> str:
    """LLM 호출. model 미지정 시 전체 무료 엔드포인트를 라운드로빈 순회."""
    if model:
        eps = _get_endpoints()
        match = next((e for e in eps if e.model == model), None)
        client = match.client if match else OpenAI(api_key=settings.zen_api_key, base_url=settings.zen_base_url)
        return _call(client, model, prompt, system)

    eps = _get_endpoints()
    tried: set[str] = set()
    last_err: Exception | None = None

    while len(tried) < len(eps):
        ep = _pick()
        if ep is None or ep.tag in tried:
            break
        tried.add(ep.tag)
        try:
            result = _call(ep.client, ep.model, prompt, system)
            logger.debug("llm ok: %s", ep.tag)
            return result
        except (RateLimitError, APIStatusError, APIConnectionError) as e:
            logger.warning("llm fail [%s]: %s", ep.tag, e)
            _trip(ep.tag)
            last_err = e

    raise RuntimeError(f"모든 엔드포인트 실패 {tried}: {last_err}")


def _call(client: OpenAI, model: str, prompt: str, system: str) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=2048,
    )
    content = resp.choices[0].message.content
    if not content:
        finish = resp.choices[0].finish_reason
        raise RuntimeError(
            f"LLM 빈 응답 — model={model}, finish_reason={finish}, "
            f"prompt={len(prompt)}자, system={len(system)}자"
        )
    return content
