alter table saved_words
  add column if not exists next_practice_at timestamptz not null default (now() + interval '1 minute'),
  add column if not exists last_practiced_at timestamptz null;

create index if not exists saved_words_user_next_practice_idx
  on saved_words(user_id, next_practice_at);

update saved_words
set next_practice_at = coalesce(next_practice_at, created_at + interval '1 minute')
where next_practice_at is null;
