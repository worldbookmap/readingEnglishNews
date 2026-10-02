-- Articles added by URL ('custom' source) and the "다시 읽기" selection on 읽은 글.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table articles drop constraint if exists articles_source_check;
alter table articles add constraint articles_source_check
  check (source in ('newyorker', 'buzzfeed', 'modernlove', 'lithub', 'waitbutwhy', 'custom'));

alter table articles add column if not exists reread_at timestamptz;  -- null = not picked to read again
