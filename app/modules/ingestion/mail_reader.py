import imaplib
import email
from email.header import decode_header
from app.config import settings


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


def fetch_unread_emails(limit: int = 10) -> list[dict]:
    if not settings.mail_user or not settings.mail_password:
        return []

    results = []
    with imaplib.IMAP4_SSL(settings.mail_imap_host, settings.mail_imap_port) as imap:
        imap.login(settings.mail_user, settings.mail_password)
        imap.select(settings.mail_folder)

        _, msg_ids = imap.search(None, "UNSEEN")
        ids = msg_ids[0].split()[-limit:]

        for mid in reversed(ids):
            _, data = imap.fetch(mid, "(RFC822)")
            raw = data[0][1]
            msg = email.message_from_bytes(raw)

            subject = _decode_str(msg.get("Subject", "(제목없음)"))
            sender  = _decode_str(msg.get("From", ""))
            body    = _get_body(msg)

            results.append({
                "title": f"[메일] {subject}",
                "content": f"보낸사람: {sender}\n제목: {subject}\n\n{body}",
                "source": "email",
            })

    return results
