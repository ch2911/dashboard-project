import logging
import os
from datetime import datetime, timezone

import requests

from services.cache import TTLCache

BASE_URL = "https://newsapi.org/v2/everything"
logger = logging.getLogger(__name__)

# NewsAPI's free plan allows 100 requests a day, and the dashboard asks for news about every
# pinned stock, so results are reused for 15 minutes.
_news_cache = TTLCache(seconds=15 * 60)


def clear_cache():
    _news_cache.clear()


def fetch_news(query="Tesla", search_in=None):
    """Latest English headlines matching `query` (NewsAPI search syntax, e.g. 'AAPL OR "Apple"').

    search_in limits where the words must appear, e.g. "title,description".
    """
    key = (query, search_in)
    cached = _news_cache.get(key)
    if cached is not None:
        return cached

    # Read at call time so app.py's load_dotenv() has already run
    api_key = os.getenv("NEWSAPI_KEY")
    params = {"q": query, "language": "en", "sortBy": "publishedAt"}
    if search_in:
        params["searchIn"] = search_in
    # The key goes in a header rather than the URL, because URLs end up in error logs
    response = requests.get(BASE_URL, params=params, headers={"X-Api-Key": api_key or ""}, timeout=10)
    data = response.json()

    if data.get("status") == "error":
        # e.g. a missing or invalid key, or the daily limit reached. Not cached, so it's retried.
        logger.warning("NewsAPI returned an error: %s", data.get("message") or data.get("code"))
        return []

    results = []
    for a in data.get("articles", [])[:20]:
        title = a.get("title", "") or ""
        article_url = a.get("url", "") or ""
        if not article_url.lower().startswith(("https://", "http://")):
            # The site turns each URL into a link, and a "javascript:" one would run code when clicked
            continue
        published = a.get("publishedAt")
        if not published:
            published = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        results.append({"title": title, "time": published, "url": article_url})

    _news_cache.set(key, results)
    return results
