"""
멀티 프로바이더 LLM 라우팅 테스트
실행: python test_llm_routing.py
"""
import os, sys, time
sys.stdout.reconfigure(encoding="utf-8")

# .env 직접 로드
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    for line in open(env_path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

from app.modules.llm import _get_endpoints, _trip, _circuit_open_until, chat

PROMPT = "Reply with exactly: OK"

eps = _get_endpoints()
if not eps:
    print("❌  활성 엔드포인트 없음 — API 키를 .env에 설정하세요")
    sys.exit(1)

print(f"활성 엔드포인트: {len(eps)}개")
for ep in eps:
    print(f"  · {ep.tag}")

# ─── 1. 엔드포인트별 직접 호출 ─────────────────────────────────────
print()
print("=" * 60)
print("1. 엔드포인트별 직접 호출")
print("=" * 60)
ok_tags = []
for ep in eps:
    try:
        t0 = time.time()
        resp = ep.client.chat.completions.create(
            model=ep.model,
            messages=[{"role": "user", "content": PROMPT}],
            max_tokens=16,
        )
        elapsed = time.time() - t0
        content = (resp.choices[0].message.content or "").strip()
        ok_tags.append(ep.tag)
        print(f"  ✓  {ep.tag:<45}  {elapsed:.1f}s  →  {content!r}")
    except Exception as e:
        print(f"  ✗  {ep.tag:<45}  {type(e).__name__}: {str(e)[:60]}")

# ─── 2. 라운드로빈 routing ─────────────────────────────────────────
print()
print("=" * 60)
print("2. chat() 라운드로빈 — 5회 호출")
print("=" * 60)
for i in range(5):
    try:
        t0 = time.time()
        answer = chat(PROMPT)
        elapsed = time.time() - t0
        print(f"  [{i+1}] {elapsed:.1f}s  →  {answer.strip()!r}")
    except RuntimeError as e:
        print(f"  [{i+1}] RuntimeError: {e}")

# ─── 3. 서킷브레이커 페일오버 ─────────────────────────────────────
print()
print("=" * 60)
print("3. 서킷브레이커 — 첫 엔드포인트 강제 차단 후 페일오버")
print("=" * 60)
first_tag = eps[0].tag
_trip(first_tag)
print(f"  → '{first_tag}' 강제 차단")
try:
    answer = chat(PROMPT)
    print(f"  ✓  페일오버 성공  →  {answer.strip()!r}")
except RuntimeError as e:
    print(f"  ✗  {e}")
_circuit_open_until.clear()
print(f"  → 서킷 초기화 완료")

print()
print(f"완료: {len(ok_tags)}/{len(eps)} 엔드포인트 정상")
