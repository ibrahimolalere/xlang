-- Saved words persistence for authenticated users (cross-device sync)
create table if not exists saved_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  normalized_word text not null,
  translation text not null,
  sentence text not null,
  video_id uuid not null references videos(id) on delete cascade,
  video_title text not null,
  created_at timestamptz not null default now(),
  unique (user_id, video_id, normalized_word)
);

create index if not exists saved_words_user_id_idx
  on saved_words(user_id, created_at desc);

alter table saved_words enable row level security;

drop policy if exists "Users manage own saved words" on saved_words;
create policy "Users manage own saved words"
  on saved_words for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
