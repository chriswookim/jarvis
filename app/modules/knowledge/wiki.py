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

def build_wiki_entry(title: str, content: str) -> dict:
    result = chat(
        prompt=(
            f"다음 내용을 마크다운 위키 형식으로 정리하세요.\n"
            f"## 개요, ## 핵심 내용, ## 관련 팀/담당자, ## 참고 사항 섹션을 포함하세요.\n\n"
            f"제목: {title}\n\n내용:\n{content[:4000]}"
        ),
        system="당신은 지식 관리 전문가입니다. 주어진 텍스트를 구조화된 마크다운 위키 항목으로 변환하세요. 한국어로 작성하세요.",
    )
    return {"topic": title, "content": result}


def extract_tasks(content: str) -> tuple[list, str]:
    """
    텍스트에서 할 일을 추출한다.
    반환: (tasks_list, debug_message)
      - tasks_list: 추출된 Task dict 목록 (실패 시 [])
      - debug_message: 로그에 기록할 상세 설명 문자열
    """
    team_list = ", ".join(TEAMS)
    raw = ""

    try:
        raw = chat(
            prompt=f"""다음 텍스트에서 할 일 항목을 추출하세요.

{COS_GUIDE}

담당 팀 목록: {team_list}
※ 본인(나) 업무는 team을 "{MY_TEAM}"으로 지정하세요.

각 항목은 아래 필드를 포함하는 JSON 배열로 반환하세요:
- title: 할 일 제목 (한 줄 요약)
- class_of_service: expedite / fixed_date / standard / intangible 중 하나
- team: 위 팀 목록 중 정확히 하나 (담당 팀이 불명확하면 "{MY_TEAM}")
- assignee: 담당자 이름 (텍스트에서 추출, 없으면 "나")
- due_date: 기한 (YYYY-MM-DD, 없으면 null)

할 일이 없으면 빈 배열 []을 반환하세요.
텍스트:
{content[:3000]}

JSON 배열만 반환하세요. 설명이나 다른 텍스트를 포함하지 마세요.""",
            system="당신은 업무 분석 전문가입니다. 텍스트에서 실행 가능한 할 일을 추출하여 JSON으로만 반환하세요.",
            model=settings.zen_model,
        )
    except Exception as e:
        return [], f"[LLM 호출 실패] {type(e).__name__}: {e}"

    raw_preview = raw.strip()[:400].replace("\n", " ")

    # JSON 배열 추출 시도
    text = raw.strip()
    parse_method = ""

    # 1) ```json ... ``` 블록
    m = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', text)
    if m:
        text = m.group(1)
        parse_method = "코드블록 추출"
    # 2) 텍스트가 [ 로 시작
    elif text.startswith('['):
        parse_method = "직접 배열"
    # 3) 텍스트 내부에 [...] 포함
    else:
        m2 = re.search(r'\[[\s\S]*\]', text)
        if m2:
            text = m2.group(0)
            parse_method = "내부 배열 추출"
        else:
            return [], (
                f"[JSON 배열 없음] LLM 응답에서 배열을 찾지 못함. "
                f"원문({len(raw)}자): {raw_preview}"
            )

    try:
        tasks = json.loads(text)
    except json.JSONDecodeError as e:
        return [], (
            f"[JSON 파싱 오류] {e} | 방법={parse_method} | "
            f"파싱 시도 텍스트: {text[:200]}"
        )

    if not isinstance(tasks, list):
        return [], f"[타입 오류] 배열이 아닌 {type(tasks).__name__} 반환됨: {str(tasks)[:200]}"

    # CoS 값 보정
    for t in tasks:
        if t.get("class_of_service") not in VALID_COS:
            t["class_of_service"] = "standard"
        if not t.get("team") or t.get("team") == "나":
            t["team"] = MY_TEAM

    debug = (
        f"[성공] {len(tasks)}개 추출 (방법={parse_method}, LLM응답 {len(raw)}자) | "
        f"원문 앞부분: {raw_preview[:150]}"
    )
    return tasks, debug
