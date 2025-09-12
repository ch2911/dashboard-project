import requests
from datetime import datetime, timezone

API_KEY = "REMOVED_NEWSAPI_KEY"
BASE_URL = "https://newsapi.org/v2/everything"

def fetch_news(query="Tesla"):
    url = f"{BASE_URL}?q={query}&language=en&sortBy=publishedAt&apiKey={API_KEY}"
    response = requests.get(url)
    data = response.json()
    articles = data.get("articles", [])[:20]

    results = []
    for a in articles:
        title = a.get("title", "") or ""
        published = a.get("publishedAt")
        if not published:
            published = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        results.append({"title": title, "time": published})
    return results

