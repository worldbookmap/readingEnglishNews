-- Books: typed in by the reader or imported from Project Gutenberg.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.
--
-- A book is an `articles` row with source 'book' (so saved words/sentences, 읽었음 and
-- 클릭함 work the same way); its text is split into pages stored in book_pages.

alter table articles drop constraint if exists articles_source_check;
alter table articles add constraint articles_source_check
  check (source in ('newyorker', 'buzzfeed', 'modernlove', 'lithub', 'waitbutwhy', 'custom', 'book'));

alter table articles add column if not exists page_count   int not null default 0;  -- books only
alter table articles add column if not exists current_page int not null default 1;  -- last page opened

create table if not exists book_pages (
  article_id  uuid not null references articles(id) on delete cascade,
  page        int not null,               -- 1-based
  blocks      jsonb not null,
  word_count  int not null default 0,
  primary key (article_id, page)
);
alter table book_pages enable row level security;
