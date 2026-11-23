-- Translations can now also be written in the app's reader. Such a row has ext_hash ''
-- until the 번역 노트 extension takes it into its document (and so into Google Drive);
-- clearing one in the app leaves translation '' so the extension removes it too. Those
-- empty rows don't count as translated.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

create or replace function book_translation_progress(ids uuid[])
returns table (article_id uuid, done int, total int)
language sql stable
as $$
  select bp.article_id, count(t.source_hash)::int, count(*)::int
  from book_pages bp
  cross join lateral jsonb_array_elements(bp.blocks) as e(value)
  left join paragraph_translations t on t.source_hash = md5(e.value->>'text') and t.translation <> ''
  where bp.article_id = any(ids) and e.value->>'type' <> 'img'
  group by bp.article_id;
$$;
