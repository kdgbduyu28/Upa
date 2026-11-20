-- Scheduled jobs (pg_cron) and live updates (Supabase Realtime).
--
-- Both are optional so the same migrations run in PGlite tests, where neither
-- pg_cron nor the supabase_realtime publication exists.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- 00:05 Manila (16:05 UTC): finish yesterday's stays so guests can review them.
    perform cron.schedule('upa-complete-bookings', '5 16 * * *',
                          'select public.complete_past_bookings()');
    -- 1st of the month: make sure the next two months of price history have partitions.
    perform cron.schedule('upa-history-partitions', '0 0 1 * *',
                          'select public.ensure_price_history_partitions(2)');
    -- Nightly safety net in case a scrape run died before refreshing the stats.
    perform cron.schedule('upa-refresh-market-stats', '30 17 * * *',
                          'refresh materialized view concurrently public.market_stats');
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Hosts' dashboards subscribe to new and changed bookings; Realtime checks
    -- each row against the bookings select policy before sending it.
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;
