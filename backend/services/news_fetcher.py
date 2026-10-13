import os
import requests
from datetime import datetime, timezone

BASE_URL = "https://newsapi.org/v2/everything"

def fetch_news(query="Tesla"):
    # Read at call time so app.py's load_dotenv() has already run
    api_key = os.getenv("NEWSAPI_KEY")
    url = f"{BASE_URL}?q={query}&language=en&sortBy=publishedAt&apiKey={api_key}"
    response = requests.get(url)
    data = response.json()
    articles = data.get("articles", [])[:20]

    results = []
    for a in articles:
        title = a.get("title", "") or ""
        article_url = a.get("url", "")
        published = a.get("publishedAt")
        if not published:
            published = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        results.append({"title": title, "time": published, "url": article_url})
    return results

