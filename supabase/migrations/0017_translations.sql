-- Korean translations written with the 번역 노트 Chrome extension on book pages. The
-- extension sends every translated paragraph of a document (one per book URL); a
-- paragraph is matched to book text by the md5 of its English text, so a book uploaded
-- again still finds its translations.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

create table if not exists paragraph_translations (
  source_hash  text primary key,          -- md5 of the English paragraph (whitespace collapsed)
  source       text not null,
  translation  text not null,
  doc_url      text not null,             -- the extension document it came from
  ext_hash     text not null,             -- the extension's own key for the paragraph
  updated_at   timestamptz not null default now()
);
create index if not exists paragraph_translations_doc on paragraph_translations (doc_url);
alter table paragraph_translations enable row level security;

-- Translated / translatable paragraphs of each book.
create or replace function book_translation_progress(ids uuid[])
returns table (article_id uuid, done int, total int)
language sql stable
as $$
  select bp.article_id, count(t.source_hash)::int, count(*)::int
  from book_pages bp
  cross join lateral jsonb_array_elements(bp.blocks) as e(value)
  left join paragraph_translations t on t.source_hash = md5(e.value->>'text')
  where bp.article_id = any(ids) and e.value->>'type' <> 'img'
  group by bp.article_id;
$$;
