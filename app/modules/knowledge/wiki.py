import json
from app.modules.llm import chat
from app.config import settings

def build_wiki_entry(title: str, content: str) -> dict:
    result = chat(
        prompt=f"다음 내용을 주제별로 정리해 주세요. 핵심 내용, 주요 인물/조직, 관련 할 일을 포함하세요.\n\n제목: {title}\n\n내용:\n{content[:4000]}",
        system="당신은 지식 관리 전문가입니다. 주어진 텍스트를 구조화된 마크다운 위키 항목으로 변환하세요.",
    )
    return {"topic": title, "content": result}

def extract_tasks(content: str) -> list:
    result = chat(
        prompt=f"""다음 텍스트에서 할 일 항목을 추출하세요.
JSON 배열로 반환하되 각 항목은 title, priority(high/medium/low), assignee(나/회장/부회장/팀) 필드를 포함하세요.

텍스트:
{content[:3000]}

JSON만 반환하세요.""",
        system="당신은 업무 분석 전문가입니다. 텍스트에서 할 일 항목을 추출하여 JSON으로 반환하세요.",
        model=settings.zen_model,
    )
    try:
        # JSON 블록만 추출
        text = result.strip()
        if "```" in text:
            text = text.split("```")[1].lstrip("json").strip()
        return json.loads(text)
    except json.JSONDecodeError:
        return []
