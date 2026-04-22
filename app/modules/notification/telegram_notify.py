import requests
from datetime import date
from app.config import settings
from app.modules.llm import chat

COS_ICON = {
    "expedite":   "🚨",
    "fixed_date": "📅",
    "standard":   "📌",
    "intangible": "💡",
}
COS_LABEL = {
    "expedite":   "긴급 처리",
    "fixed_date": "기한 고정",
    "standard":   "일반 업무",
    "intangible": "장기 개선",
}

def send_message(text: str) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": "Markdown",
    })
    return resp.ok

def send_daily_report(tasks: list) -> bool:
    if not tasks:
        return send_message("오늘 할 일이 없습니다.")

    today = date.today().strftime("%Y-%m-%d")
    pending   = [t for t in tasks if t.get("status", "pending") != "done"]
    done      = [t for t in tasks if t.get("status") == "done"]

    # CoS 순서: expedite → fixed_date → standard → intangible
    cos_order = ["expedite", "fixed_date", "standard", "intangible"]

    lines = [f"*📋 주간 업무 보고 | 기획홍보팀 | {today}*\n"]

    # CoS별 그룹화
    for cos in cos_order:
        group = [t for t in pending if t.get("class_of_service", "standard") == cos]
        if not group:
            continue
        icon  = COS_ICON[cos]
        label = COS_LABEL[cos]
        lines.append(f"\n{icon} *{label}*")

        # 팀별 서브그룹
        teams_in_group: dict[str, list] = {}
        for t in group:
            team = t.get("team", "미분류")
            teams_in_group.setdefault(team, []).append(t)

        for team, team_tasks in teams_in_group.items():
            lines.append(f"┌ _{team}_")
            for t in team_tasks:
                due = f" _{t['due_date']}까지_" if t.get("due_date") else ""
                lines.append(f"  • {t.get('title', '')}{due}")

    # 완료 항목
    if done:
        lines.append(f"\n✅ *완료 ({len(done)}건)*")
        for t in done:
            lines.append(f"  • {t.get('title', '')}")

    # WIP 요약
    expedite_count = sum(1 for t in pending if t.get("class_of_service") == "expedite")
    if expedite_count:
        lines.append(f"\n⚠️ 긴급 처리 항목 {expedite_count}건 즉시 확인 필요")

    return send_message("\n".join(lines))
