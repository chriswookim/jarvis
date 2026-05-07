from openai import OpenAI, RateLimitError, APIStatusError, APIConnectionError
from app.config import settings
import threading
import time
import logging

logger = logging.getLogger(__name__)

_client: OpenAI | None = None

# Zen 무료 모델 목록 (순서 = 기본 우선순위)
FREE_MODELS = [
    "big-pickle",
    "minimax-m2.5-free",
    "ling-2.6-flash",
    "hy3-preview-free",
    "nemotron-3-super-free",
]

CIRCUIT_COOLDOWN = 60  # 실패 후 재시도 대기(초)

_rr_idx = 0
_circuit_open_until: dict[str, float] = {}
_lock = threading.Lock()


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.zen_api_key,
            base_url=settings.zen_base_url,
        )
    return _client


def _pick_model() -> str | None:
    """라운드로빈으로 다음 사용 가능한 모델 반환. 모두 차단된 경우 None."""
    global _rr_idx
    now = time.time()
    with _lock:
        for _ in range(len(FREE_MODELS)):
            model = FREE_MODELS[_rr_idx % len(FREE_MODELS)]
            _rr_idx += 1
            if _circuit_open_until.get(model, 0) <= now:
                return model
    return None


def _trip(model: str) -> None:
    with _lock:
        _circuit_open_until[model] = time.time() + CIRCUIT_COOLDOWN
    logger.warning("circuit tripped: %s (%ds cooldown)", model, CIRCUIT_COOLDOWN)


def chat(prompt: str, system: str = "", model: str | None = None) -> str:
    """LLM 호출. model 미지정 시 무료 모델을 라운드로빈으로 순회."""
    if model:
        return _call(model, prompt, system)

    tried: set[str] = set()
    last_err: Exception | None = None

    while len(tried) < len(FREE_MODELS):
        m = _pick_model()
        if m is None or m in tried:
            break
        tried.add(m)
        try:
            result = _call(m, prompt, system)
            logger.debug("llm ok: %s", m)
            return result
        except (RateLimitError, APIStatusError, APIConnectionError) as e:
            logger.warning("llm fail [%s]: %s", m, e)
            _trip(m)
            last_err = e

    raise RuntimeError(f"모든 무료 모델 실패 {tried}: {last_err}")


def _call(model: str, prompt: str, system: str) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = get_client().chat.completions.create(
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
