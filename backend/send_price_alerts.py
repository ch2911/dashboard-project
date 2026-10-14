"""Email users whose pinned stocks moved past their alert threshold today.

Run on a schedule by .github/workflows/price-alerts.yml. Needs these environment variables:

    SUPABASE_URL               e.g. https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY  Supabase → Project Settings → API keys (keep it secret)
    RESEND_API_KEY             from https://resend.com
    ALERT_FROM_EMAIL           e.g. "Stock Dashboard <alerts@yourdomain.com>"
    SITE_URL                   optional, linked from the email so users can change their settings
    ALERT_OWNER_ID             optional, a Supabase user id: only email that user (demo mode)
"""
import logging
import os
import sys

import requests

from services.price_alerts import ResendSender, SupabaseStore, market_today, run

REQUIRED = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "ALERT_FROM_EMAIL")


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        return 1

    session = requests.Session()
    store = SupabaseStore(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"], session)
    sender = ResendSender(os.environ["RESEND_API_KEY"], os.environ["ALERT_FROM_EMAIL"], session)
    sent = run(store, sender, market_today(), site_url=os.environ.get("SITE_URL") or None,
               owner_id=os.environ.get("ALERT_OWNER_ID") or None)
    print(f"Sent {sent} price alert email(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
