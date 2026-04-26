import imaplib
import email
import ssl
from email.header import decode_header
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone, timedelta
from app.config import settings

MAX_AGE_DAYS = 3


def _decode_str(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        decoded, charset = decode_header(value.decode())[0]
        if isinstance(decoded, bytes):
            return decoded.decode(charset or "utf-8", errors="replace")
        return decoded
    parts = decode_header(value)
    result = []
    for part, charset in parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return "".join(result)


def _get_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace")
    return ""


def _parse_date(msg) -> datetime | None:
    date_str = msg.get("Date", "")
    if not date_str:
        return None
    try:
        dt = parsedate_to_datetime(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def fetch_unread_emails(limit: int = 10) -> list[dict]:
    if not settings.mail_user or not settings.mail_password:
        return []

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    now = datetime.now(timezone.utc)
    KST = timezone(timedelta(hours=9))
    results = []

    with imaplib.IMAP4_SSL(settings.mail_imap_host, settings.mail_imap_port, ssl_context=ssl_ctx) as imap:
        imap.login(settings.mail_user, settings.mail_password)
        imap.select(settings.mail_folder)

        _, msg_ids = imap.search(None, "UNSEEN")
        ids = msg_ids[0].split()[-limit:]

        for mid in reversed(ids):
            _, data = imap.fetch(mid, "(BODY.PEEK[])")
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            sent_dt = _parse_date(msg)
            if sent_dt and (now - sent_dt).days > MAX_AGE_DAYS:
                continue  # 3일 이상 지난 메일 건너뜀

            subject = _decode_str(msg.get("Subject", "(제목없음)"))
            sender  = _decode_str(msg.get("From", ""))
            body    = _get_body(msg)

            if sent_dt:
                kst_dt = sent_dt.astimezone(KST)
                date_display = kst_dt.strftime("%Y년 %m월 %d일 %H:%M")
            else:
                date_display = "날짜 불명"

            results.append({
                "title": f"[메일] {subject}",
                "content": (
                    f"발송일: {date_display}\n"
                    f"보낸사람: {sender}\n"
                    f"제목: {subject}\n\n"
                    f"{body}"
                ),
                "source": "email",
            })

    return results
