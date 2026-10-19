-- Where in the current page the reader left off (index of the paragraph at the top of
-- the screen), so a book reopens at the same spot.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table articles add column if not exists current_block int not null default 0;
