-- Add NYT Modern Love and Literary Hub as sources.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table articles drop constraint if exists articles_source_check;
alter table articles add constraint articles_source_check
  check (source in ('newyorker', 'buzzfeed', 'modernlove', 'lithub'));
