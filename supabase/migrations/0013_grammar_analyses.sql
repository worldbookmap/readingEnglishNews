-- Grammar analyses of dragged sentences (Claude API), cached so the same sentence is
-- analysed (and billed) only once.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

create table if not exists grammar_analyses (
  sentence    text primary key,
  result      jsonb not null,               -- { translation, pattern, chunks[], points[] }
  model       text not null,
  created_at  timestamptz not null default now()
);

alter table grammar_analyses enable row level security;
