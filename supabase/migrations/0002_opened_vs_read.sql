-- Separate "clicked/opened" (automatic, on every visit) from "read" (marked by the reader).
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table articles rename column first_read_at to first_opened_at;
alter table articles rename column last_read_at  to last_opened_at;
alter table articles rename column read_count    to open_count;
alter table articles add column if not exists read_at timestamptz;  -- null = not marked as read

drop index if exists articles_last_read_idx;
create index if not exists articles_last_opened_idx on articles (last_opened_at desc) where last_opened_at is not null;
create index if not exists articles_read_at_idx on articles (read_at desc) where read_at is not null;

drop function if exists mark_article_read(uuid);
create or replace function mark_article_opened(p_id uuid)
returns void language sql as $$
  update articles
     set open_count      = open_count + 1,
         first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at  = now()
   where id = p_id;
$$;
