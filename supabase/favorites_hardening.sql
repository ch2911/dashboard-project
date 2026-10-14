-- Limits on pinned stocks (public.favorites). Run once in the Supabase SQL editor.
--
-- Users write this table directly from the browser, so without these limits a user could pin the
-- same stock many times or store any text as a "symbol". The price alert job then looks up every
-- pinned symbol on Yahoo Finance. The backend skips anything that isn't a ticker, but the database
-- is the place to stop it being saved at all.

-- A ticker: letters and digits, plus "." (RR.L), "-" (BRK-B), "=" (GBPUSD=X) and "^" (^GSPC),
-- matching frontend/utils/stockLinks.ts and backend/services/tickers.py.
alter table public.favorites
  add constraint favorites_symbol_is_ticker
  check (symbol ~ '^[A-Za-z0-9^][A-Za-z0-9.=^-]{0,14}$');

-- Each stock pinned at most once per user
alter table public.favorites
  add constraint favorites_user_symbol_unique unique (user_id, symbol);

-- At most 50 pinned stocks per user, so one account can't make the alert job do unlimited lookups
create or replace function public.limit_favorites_per_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.favorites where user_id = new.user_id) >= 50 then
    raise exception 'You can pin at most 50 stocks';
  end if;
  return new;
end;
$$;

create trigger favorites_limit_per_user
  before insert on public.favorites
  for each row execute function public.limit_favorites_per_user();

-- Remove a user's pinned stocks automatically when their login is deleted
alter table public.favorites
  drop constraint favorites_user_id_fkey,
  add constraint favorites_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
