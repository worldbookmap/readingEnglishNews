-- Full-text search over saved articles and books: every paragraph containing the query
-- (case-insensitive), with where it is (article, book page, paragraph index). Articles and
-- books are limited separately so a common word in a long book doesn't crowd out articles.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

create extension if not exists pg_trgm;

-- Trigram indexes let `ilike '%…%'` skip rows that can't match.
create index if not exists articles_blocks_trgm on articles using gin ((blocks::text) gin_trgm_ops);
create index if not exists book_pages_blocks_trgm on book_pages using gin ((blocks::text) gin_trgm_ops);

create or replace function search_content(q text, max_rows int default 300)
returns table (article_id uuid, page int, block int, text text)
language sql stable
as $$
  with p as (
    select '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  (
    select a.id, null::int, (e.ord - 1)::int, e.value->>'text'
    from p, articles a, jsonb_array_elements(a.blocks) with ordinality as e(value, ord)
    where a.source <> 'book' and a.blocks::text ilike p.pattern and e.value->>'text' ilike p.pattern
    limit max_rows
  )
  union all
  (
    select bp.article_id, bp.page, (e.ord - 1)::int, e.value->>'text'
    from p, book_pages bp, jsonb_array_elements(bp.blocks) with ordinality as e(value, ord)
    where bp.blocks::text ilike p.pattern and e.value->>'text' ilike p.pattern
    order by bp.article_id, bp.page
    limit max_rows
  );
$$;
