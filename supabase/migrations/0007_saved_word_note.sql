-- A personal note (meaning in Korean, usage tip, …) on a saved word or phrase.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table saved_words add column if not exists note text;
