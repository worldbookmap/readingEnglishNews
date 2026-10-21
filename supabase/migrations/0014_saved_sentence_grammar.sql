-- A saved sentence keeps its grammar analysis (when it was analysed), shown on 단어장 → 문장.
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table saved_sentences add column if not exists grammar jsonb;

-- Sentences saved and analysed before this column existed.
update saved_sentences s
set grammar = g.result
from grammar_analyses g
where s.grammar is null and g.sentence = s.text;
