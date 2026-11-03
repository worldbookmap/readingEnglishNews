-- BBC Learning English programmes: the episode's MP3 (from the page's "Download Audio"
-- link), played in the app. null = not looked up yet, '' = none (video only or a
-- broken link).
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table articles add column if not exists audio_url text;
