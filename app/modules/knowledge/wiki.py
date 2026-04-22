import json
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

def extract_tasks(content: str) -> list:
    team_list = ", ".join(TEAMS)
    result = chat(
        prompt=f"""다음 텍스트에서 할 일 항목을 추출하세요.

{COS_GUIDE}

담당 팀 목록: {team_list}, 나(={MY_TEAM} 담당자 본인)

각 항목은 아래 필드를 포함하는 JSON 배열로 반환하세요:
- title: 할 일 제목
- class_of_service: expedite / fixed_date / standard / intangible 중 하나
- team: 위 팀 목록 중 하나 또는 "나" (본인 업무)
- assignee: 담당자 이름 또는 팀명 (텍스트에서 추출, 없으면 "나")
- due_date: 기한 (YYYY-MM-DD 형식, 없으면 null)

텍스트:
{content[:3000]}

JSON 배열만 반환하세요. 다른 텍스트 없이.""",
        system="당신은 업무 분석 전문가입니다. 텍스트에서 할 일을 추출하여 JSON으로만 반환하세요.",
        model=settings.zen_model,
    )
    try:
        import re
        text = result.strip()
        # Extract JSON array from response (handles ```json ... ```, bare [...], or embedded)
        m = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', text)
        if m:
            text = m.group(1)
        elif not text.startswith('['):
            m2 = re.search(r'\[[\s\S]*\]', text)
            if m2:
                text = m2.group(0)
        return json.loads(text)
    except (json.JSONDecodeError, Exception):
        return []
