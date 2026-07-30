-- Fixed-window rate-limit buckets (spec §2.12, §10 security).
--
-- Backs per-IP throttling for public, unauthenticated Edge Functions (e.g.
-- verify-certificate's 30/min lookup limit). The table is UNLOGGED: the counters
-- are ephemeral and rebuild on their own every window, so there is no value in
-- WAL-logging them or replicating them — losing the table on crash simply resets
-- everyone's window, which is acceptable for a throttle.
--
-- A "bucket" is an opaque caller key (e.g. 'verify-certificate:203.0.113.7')
-- combined with the current fixed window start. enforce_rate_limit() is
-- SECURITY DEFINER so the anon role can throttle itself without any table grant,
-- exactly like next_serial()/verify_certificate().

create unlogged table public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

-- enforce_rate_limit: atomically counts one hit for (p_key, current window) and
-- returns true when the caller is still within p_limit for that window, false
-- once the limit is exceeded. Callers decide what to do with a false (typically
-- raise RATE_LIMITED / HTTP 429).
create or replace function public.enforce_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Floor clock_timestamp() to the start of the current fixed window so all hits
  -- in the same window share a row.
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_hits int;
begin
  insert into public.rate_limit_hits (bucket, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket, window_start)
    do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;

  -- Opportunistic, cheap-in-aggregate cleanup of expired windows so the table
  -- does not grow unbounded. Gated by random() to avoid every request paying for
  -- the sweep.
  if random() < 0.01 then
    delete from public.rate_limit_hits
    where window_start < clock_timestamp() - make_interval(secs => p_window_seconds * 2);
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.enforce_rate_limit(text, int, int) from anon, authenticated;

-- The table is reached only through the SECURITY DEFINER function above; deny all
-- direct PostgREST access, mirroring serial_sequences.
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
