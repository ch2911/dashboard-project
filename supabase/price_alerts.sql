-- Tables for the daily price alert emails (backend/send_price_alerts.py).
-- Run once in the Supabase SQL editor.

-- Each user's alert preferences. Users without a row get alerts at a 5% threshold.
create table if not exists public.alert_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  threshold_percent numeric(5, 2) not null default 5
    check (threshold_percent > 0 and threshold_percent <= 100),
  updated_at timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

create policy "Users read their own alert settings" on public.alert_settings
  for select using (auth.uid() = user_id);
create policy "Users add their own alert settings" on public.alert_settings
  for insert with check (auth.uid() = user_id);
create policy "Users change their own alert settings" on public.alert_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Alerts already emailed, so each stock is emailed at most once per user per trading day.
-- Only the alert job (using the service role key) reads and writes it, so it has no policies.
create table if not exists public.alerts_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  alert_date date not null,
  change_percent numeric not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, symbol, alert_date)
);

alter table public.alerts_sent enable row level security;
