# Gunicorn reads this file automatically when started from the backend folder,
# so Render's start command can stay as `gunicorn app:app`.

# One process, because the free plan only has 512 MB of memory and each process loads
# pandas and statsmodels...
workers = 1

# ...but several threads, so one slow request (e.g. a forecast, or a slow reply from
# Yahoo Finance or NewsAPI) doesn't hold up every other request behind it.
worker_class = "gthread"
threads = 4

# Allow slow upstream APIs more than the default 30 seconds before giving up
timeout = 120
