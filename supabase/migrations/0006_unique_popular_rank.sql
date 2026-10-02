-- Fetching twice on the same day used to restart popular_rank at 1, so ranks within a
-- (popular_on, source) group could repeat. Renumber existing rows 1..n in display order.
-- Run once in the Supabase SQL editor.

with renumbered as (
  select id,
         row_number() over (partition by popular_on, source order by popular_rank, fetched_at) as rank
    from articles
)
update articles a
   set popular_rank = r.rank
  from renumbered r
 where a.id = r.id
   and a.popular_rank <> r.rank;
