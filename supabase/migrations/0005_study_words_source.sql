-- study_words can now come from several studylang files (study-colly.json, study-baebjji.json).
-- Run in the Supabase SQL editor BEFORE deploying the matching app code.

alter table study_words add column if not exists source text not null default 'colly';
alter table study_words alter column source drop default;
alter table study_words drop constraint if exists study_words_pkey;
alter table study_words add primary key (source, id);
