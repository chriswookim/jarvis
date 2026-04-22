from mem0 import Memory
from app.config import settings
import os

_memory: Memory | None = None

def _get_memory() -> Memory:
    global _memory
    if _memory is None:
        config = {
            "llm": {
                "provider": "openai",
                "config": {
                    "model": settings.zen_memory_model,
                    "api_key": settings.zen_api_key,
                    "openai_base_url": settings.zen_base_url,
                }
            },
            "vector_store": {
                "provider": "chroma",
                "config": {"path": os.path.join(settings.data_dir, "mem0_chroma")}
            }
        }
        _memory = Memory.from_config(config)
    return _memory

USER_ID = "jarvis_user"

def remember(content: str) -> None:
    _get_memory().add(content, user_id=USER_ID)

def recall(query: str) -> list:
    return _get_memory().search(query, user_id=USER_ID, limit=5)

def get_summary() -> str:
    memories = _get_memory().get_all(user_id=USER_ID)
    if not memories:
        return "저장된 메모리가 없습니다."
    return "\n".join(f"- {m['memory']}" for m in memories[:10])
