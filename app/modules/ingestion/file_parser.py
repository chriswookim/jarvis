import markdown
from pypdf import PdfReader
from pathlib import Path

def parse_file(file_path: str) -> dict:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        text = _parse_pdf(file_path)
    elif suffix in (".md", ".txt"):
        text = path.read_text(encoding="utf-8")
    else:
        raise ValueError(f"지원하지 않는 파일 형식: {suffix}")

    return {"title": path.stem, "content": text, "source": "file"}

def _parse_pdf(file_path: str) -> str:
    reader = PdfReader(file_path)
    return "\n".join(page.extract_text() or "" for page in reader.pages)
