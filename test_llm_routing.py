"""
Zen 무료 LLM 라우팅 테스트
실행: python test_llm_routing.py
"""
import os, sys, time
sys.stdout.reconfigure(encoding="utf-8")

# .env 직접 로드 (dotenv 없이)
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    for line in open(env_path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

from openai import OpenAI
from app.modules.llm import FREE_MODELS, chat, _trip, _circuit_open_until

API_KEY  = os.environ.get("ZEN_API_KEY", "")
BASE_URL = os.environ.get("ZEN_BASE_URL", "https://opencode.ai/zen/v1")

if not API_KEY or "여기에" in API_KEY:
    print("❌  ZEN_API_KEY 미설정 — .env에 실제 키를 입력하세요")
    sys.exit(1)

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
PROMPT = "Reply with exactly: OK"

# ─── 1. 모델별 직접 호출 ────────────────────────────────────────────
print("=" * 55)
print("1. 무료 모델 개별 호출 테스트")
print("=" * 55)
results = {}
for model in FREE_MODELS:
    try:
        t0 = time.time()
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": PROMPT}],
            max_tokens=16,
        )
        elapsed = time.time() - t0
        content = resp.choices[0].message.content or ""
        results[model] = True
        print(f"  ✓  {model:<28}  {elapsed:.1f}s  →  {content.strip()!r}")
    except Exception as e:
        results[model] = False
        print(f"  ✗  {model:<28}  {type(e).__name__}: {e}")

# ─── 2. 라운드로빈 routing ──────────────────────────────────────────
print()
print("=" * 55)
print("2. chat() 라운드로빈 — 5회 호출")
print("=" * 55)
for i in range(5):
    try:
        t0 = time.time()
        answer = chat(PROMPT)
        elapsed = time.time() - t0
        print(f"  [{i+1}] {elapsed:.1f}s  →  {answer.strip()!r}")
    except RuntimeError as e:
        print(f"  [{i+1}] RuntimeError: {e}")

# ─── 3. 서킷브레이커 페일오버 ──────────────────────────────────────
print()
print("=" * 55)
print("3. 서킷브레이커 테스트 — 첫 모델 강제 차단 후 호출")
print("=" * 55)
_trip(FREE_MODELS[0])
print(f"  → '{FREE_MODELS[0]}' 강제 차단")
try:
    answer = chat(PROMPT)
    print(f"  ✓  페일오버 성공  →  {answer.strip()!r}")
except RuntimeError as e:
    print(f"  ✗  {e}")
_circuit_open_until.clear()
print(f"  → 서킷 초기화 완료")

print()
print("테스트 완료")
