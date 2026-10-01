-- Words imported from worldbookmap/studylang (data/study-colly.json, entries with type = 'word'),
-- shown together with saved_words on the 암기장 page.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

create table if not exists study_words (
  id           text primary key,            -- the entry's id in study-colly.json
  word         text not null,               -- "english"
  meaning      text not null,               -- "korean"
  created_at   timestamptz not null,        -- the entry's createdAt
  imported_at  timestamptz not null default now()
);
create index if not exists study_words_created_idx on study_words (created_at desc);

alter table study_words enable row level security;
