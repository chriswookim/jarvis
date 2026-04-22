import requests
from bs4 import BeautifulSoup

def crawl_url(url: str) -> dict:
    response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title else url
    content = soup.get_text(separator="\n", strip=True)

    return {"title": title, "content": content, "source": "web"}
