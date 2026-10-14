import os
import requests
from datetime import datetime, timezone

BASE_URL = "https://newsapi.org/v2/everything"

def fetch_news(query="Tesla"):
    # Read at call time so app.py's load_dotenv() has already run
    api_key = os.getenv("NEWSAPI_KEY")
    params = {"q": query, "language": "en", "sortBy": "publishedAt"}
    # The key goes in a header rather than the URL, because URLs end up in error logs
    response = requests.get(BASE_URL, params=params, headers={"X-Api-Key": api_key or ""}, timeout=10)
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

