from openai import OpenAI
from app.config import settings

_client: OpenAI | None = None

def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=settings.zen_api_key,
            base_url=settings.zen_base_url,
        )
    return _client

def chat(prompt: str, system: str = "", model: str | None = None) -> str:
    used_model = model or settings.zen_model
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = get_client().chat.completions.create(
        model=used_model,
        messages=messages,
        max_tokens=2048,
    )
    content = resp.choices[0].message.content
    if not content:
        finish = resp.choices[0].finish_reason
        raise RuntimeError(
            f"LLM 빈 응답 — model={used_model}, finish_reason={finish}, "
            f"prompt={len(prompt)}자, system={len(system)}자"
        )
    return content
