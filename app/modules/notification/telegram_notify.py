import requests
from app.config import settings

def send_message(text: str) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    resp = requests.post(url, json={"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "Markdown"})
    return resp.ok

def send_daily_report(tasks: list) -> bool:
    if not tasks:
        return send_message("오늘 할 일이 없습니다.")

    lines = ["*오늘의 할 일*\n"]
    for t in tasks:
        icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(t.get("priority", ""), "•")
        lines.append(f"{icon} [{t.get('assignee', '나')}] {t.get('title', '')}")

    return send_message("\n".join(lines))
