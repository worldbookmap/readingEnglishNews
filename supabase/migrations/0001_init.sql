-- Reading English News — initial schema.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
--
-- All access goes through the Next.js server with the service-role key, so RLS is
-- enabled with no policies: the public anon key cannot read or write anything.

create extension if not exists pgcrypto;

-- Articles fetched from the sources. Kept forever; reading progress lives on the row.
create table if not exists articles (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('newyorker', 'buzzfeed')),
  url             text not null unique,
  title           text not null,
  byline          text,
  excerpt         text,
  image_url       text,
  published_at    timestamptz,
  blocks          jsonb not null,          -- [{type:'p'|'h'|'quote'|'li', text} | {type:'img', src, caption}]
  word_count      int not null default 0,
  popular_on      date not null,           -- the day this article was popular ("yesterday" at fetch time)
  popular_rank    int not null,            -- 1 = most popular that day
  fetched_at      timestamptz not null default now(),
  first_read_at   timestamptz,
  last_read_at    timestamptz,
  read_count      int not null default 0
);
create index if not exists articles_popular_on_idx on articles (popular_on desc, source, popular_rank);
create index if not exists articles_last_read_idx on articles (last_read_at desc) where last_read_at is not null;

-- Words clicked while reading. The same word can be saved from several articles.
create table if not exists saved_words (
  id          uuid primary key default gen_random_uuid(),
  word        text not null,              -- lower-cased form, e.g. "ruthless"
  context     text,                       -- the sentence it appeared in
  definition  text,                       -- short English definition (dictionaryapi.dev), if found
  phonetic    text,
  article_id  uuid not null references articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (word, article_id)
);
create index if not exists saved_words_created_idx on saved_words (created_at desc);
create index if not exists saved_words_word_idx on saved_words (word);

-- Sentences (or any selected passage) saved while reading.
create table if not exists saved_sentences (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  note        text,
  article_id  uuid not null references articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (text, article_id)
);
create index if not exists saved_sentences_created_idx on saved_sentences (created_at desc);

alter table articles        enable row level security;
alter table saved_words     enable row level security;
alter table saved_sentences enable row level security;

-- Atomic "I opened this article" bump used by the reader page.
create or replace function mark_article_read(p_id uuid)
returns void language sql as $$
  update articles
     set read_count    = read_count + 1,
         first_read_at = coalesce(first_read_at, now()),
         last_read_at  = now()
   where id = p_id;
$$;
