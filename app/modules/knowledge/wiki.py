import json, re
from app.modules.llm import chat
from app.config import settings

TEAMS = [
    "기획홍보팀", "법제팀", "해외수주지원팀", "산업혁신팀", "총무관리팀",
    "정보화팀", "경영지원팀", "회원서비스팀", "경력관리팀", "인재육성팀", "엔지니어링데일리",
]
MY_TEAM = "기획홍보팀"

COS_GUIDE = """서비스 등급(class_of_service) 분류 기준:
- expedite: 즉시 처리 필요, 지연 시 심각한 손해 (긴급/장애/위기)
- fixed_date: 특정 날짜까지 반드시 완료 (행사/계약/법적 기한)
- standard: 일반적인 업무 흐름으로 처리 (대부분의 업무)
- intangible: 기한 없는 개선/연구/검토 사항"""

VALID_COS = {"expedite", "fixed_date", "standard", "intangible"}
CHUNK_SIZE    = 4000   # 청크 크기 (chars)
CHUNK_OVERLAP = 300    # 청크 간 겹침 (문장 경계 보존)
WIKI_DIRECT   = 8000   # 이하면 바로 처리, 초과면 청크 요약 후 합산


def _chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap
    return chunks


def _parse_json_array(raw: str) -> tuple[list | None, str]:
    text = raw.strip()
    m = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', text)
    if m:
        text, method = m.group(1), "코드블록"
    elif text.startswith('['):
        method = "직접배열"
    else:
        m2 = re.search(r'\[[\s\S]*\]', text)
        if m2:
            text, method = m2.group(0), "내부배열"
        else:
            return None, "배열없음"
    try:
        result = json.loads(text)
        return (result if isinstance(result, list) else None), method
    except json.JSONDecodeError:
        return None, "파싱오류"


def _dedup_tasks(tasks: list) -> list:
    """제목 유사도 기반 중복 제거 (단어 60% 이상 겹치면 중복)."""
    result, seen = [], []
    for task in tasks:
        words = set(w for w in task.get("title", "").lower().split() if len(w) > 1)
        if not words:
            continue
        is_dup = any(len(words & s) / len(words) >= 0.6 for s in seen if s)
        if not is_dup:
            result.append(task)
            seen.append(words)
    return result


def _format_memories(memories: list) -> str:
    if not memories:
        return ""
    facts = "\n".join(f"- {m['memory']}" for m in memories[:5] if m.get("memory"))
    return f"\n\n[참고 기억]\n{facts}" if facts else ""


def build_wiki_entry(title: str, content: str, memories: list = None) -> dict:
    memory_ctx = _format_memories(memories or [])

    if len(content) <= WIKI_DIRECT:
        body = content
    else:
        # 긴 문서: 청크별 요약 후 합산
        chunks = _chunk_text(content, size=CHUNK_SIZE, overlap=200)
        summaries = []
        for i, chunk in enumerate(chunks):
            try:
                s = chat(
                    prompt=f"다음 텍스트의 핵심 내용을 5~7문장으로 요약하세요 (섹션 {i+1}/{len(chunks)}):\n\n{chunk}",
                    system="한국어로 핵심 내용만 간결하게 요약하세요. 번호나 머리말 없이 문장만 출력하세요.",
                )
                summaries.append(s.strip())
            except Exception:
                summaries.append(chunk[:600])
        body = "\n\n---\n\n".join(summaries)

    result = chat(
        prompt=(
            f"다음 내용을 마크다운 위키 형식으로 정리하세요.\n"
            f"## 개요, ## 핵심 내용, ## 관련 팀/담당자, ## 참고 사항 섹션을 포함하세요.\n\n"
            f"제목: {title}\n\n내용:\n{body}"
            f"{memory_ctx}"
        ),
        system="당신은 지식 관리 전문가입니다. 주어진 텍스트를 구조화된 마크다운 위키 항목으로 변환하세요. 참고 기억이 있으면 관련 팀/담당자 섹션에 활용하세요. 한국어로 작성하세요.",
    )
    return {"topic": title, "content": result}


def extract_tasks(content: str, memories: list = None) -> tuple[list, str]:
    """
    텍스트에서 할 일을 추출한다. 긴 문서는 청크 분할 처리.
    반환: (tasks_list, debug_message)
    """
    team_list = ", ".join(TEAMS)
    memory_ctx = _format_memories(memories or [])
    chunks = _chunk_text(content)

    all_tasks: list = []
    chunk_logs: list[str] = []

    for i, chunk in enumerate(chunks):
        label = f"{i+1}/{len(chunks)}"
        try:
            raw = chat(
                prompt=f"""다음 텍스트에서 실행 가능한 할 일을 빠짐없이 추출하세요.

추출 대상 (모두 포함):
- 명시적 지시/요청 ("~해주세요", "~바랍니다", "~요청드립니다")
- 추진·검토·협의 예정 사항
- 기한이 있는 업무
- 회의·보고서에서 결정된 후속 조치

{COS_GUIDE}

담당 팀 목록: {team_list}
※ 본인(나) 업무는 team을 "{MY_TEAM}"으로 지정하세요.{memory_ctx}

반환 형식: JSON 배열
각 항목: title / class_of_service / team / assignee / due_date(YYYY-MM-DD 또는 null) / project(프로젝트명 또는 null)

project 분류:
- 여러 할 일이 하나의 상위 목표·이니셔티브에 속하면 같은 project명 사용 (예: "홈페이지 개편", "2026 워크숍")
- 단일·루틴 업무는 project: null

정말 할 일이 없으면: []

텍스트 (파트 {label}):
{chunk}

JSON 배열만 반환하세요.""",
                system="당신은 업무 분석 전문가입니다. 할 일을 JSON 배열로만 반환합니다.",
                model=settings.zen_model,
            )
        except Exception as e:
            chunk_logs.append(f"파트{label}[LLM실패:{type(e).__name__}]")
            continue

        chunk_tasks, method = _parse_json_array(raw)
        if chunk_tasks is None:
            chunk_logs.append(f"파트{label}[파싱실패:{method}]")
            continue

        # CoS/팀 보정
        for t in chunk_tasks:
            if t.get("class_of_service") not in VALID_COS:
                t["class_of_service"] = "standard"
            if not t.get("team") or t.get("team") == "나":
                t["team"] = MY_TEAM

        all_tasks.extend(chunk_tasks)
        chunk_logs.append(f"파트{label}[{len(chunk_tasks)}개,{method}]")

    deduped = _dedup_tasks(all_tasks)
    removed = len(all_tasks) - len(deduped)
    dup_note = f", 중복제거 {removed}개" if removed else ""
    debug = (
        f"[총 {len(chunks)}청크] {' '.join(chunk_logs)} "
        f"→ 최종 {len(deduped)}개{dup_note}"
    )
    return deduped, debug


def lint_wiki(entries: list[dict]) -> str:
    """모든 위키 항목 목록을 LLM으로 점검하여 이슈 보고."""
    if len(entries) < 2:
        return "위키 항목이 2개 미만입니다."
    lines = [
        f"[ID:{e['id']}] {e['topic']} (폴더:{e['folder']}, 수정:{(e.get('updated_at') or '')[:10]})"
        for e in entries
    ]
    return chat(
        prompt=f"""다음은 지식 위키의 전체 항목 목록입니다:

{chr(10).join(lines)}

아래 기준으로 lint(점검)를 수행하세요:
1. **중복/유사 주제**: 합칠 수 있는 항목 쌍 (ID 명시, 병합 이유 설명)
2. **오래된 항목**: 시의성 있는 주제인데 30일+ 미수정된 것 (재검토 권장)
3. **고아 항목**: 다른 항목과 연관이 거의 없어 보이는 고립된 항목

이슈가 있으면 항목 ID를 명시해 간결하게 보고하세요. 없으면 "이슈 없음"으로 답하세요.
한국어로 작성하세요.""",
        system="당신은 지식 관리 전문가입니다. 위키 항목 목록을 분석하여 품질 이슈를 보고합니다.",
    )


def extract_memories(title: str, content: str) -> list[str]:
    """문서에서 장기적으로 참고할 사실을 추출한다."""
    # 메모리는 문서 전반에 흩어져 있을 수 있으므로 청크별 처리
    chunks = _chunk_text(content, size=3000, overlap=200)
    all_facts: list[str] = []

    for chunk in chunks:
        try:
            raw = chat(
                prompt=f"""다음 문서에서 나중에 참고할 가치가 있는 사실만 추출하세요.

기억할 만한 사실:
- 사람/팀 역할 (예: "김팀장은 경영지원팀 팀장이다")
- 결정 사항 (예: "A프로젝트는 6월까지 완료")
- 규칙/지침 (예: "보고서는 2페이지 이내")
- 중요한 반복 일정
- 연락처/채널 정보

반환: JSON 문자열 배열 (없으면 [])

제목: {title}
내용: {chunk}

JSON 배열만 반환하세요.""",
                system="정보 추출 전문가. 장기 참고가치가 있는 핵심 사실만 추출. 일회성·단순 서술 제외.",
            )
            text = raw.strip()
            m = re.search(r'\[[\s\S]*\]', text)
            if m:
                facts = json.loads(m.group(0))
                if isinstance(facts, list):
                    all_facts.extend(f for f in facts if isinstance(f, str) and f.strip())
        except Exception:
            continue

    # 중복 제거
    seen, unique = set(), []
    for f in all_facts:
        key = f.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique[:15]  # 최대 15개
