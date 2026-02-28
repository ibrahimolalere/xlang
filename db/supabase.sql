-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Drop order for re-runs in development
drop table if exists learner_saved_words cascade;
drop table if exists learner_profiles cascade;
drop table if exists transcripts cascade;
drop table if exists videos cascade;
drop table if exists levels cascade;

create table levels (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (name in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'))
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  level_id uuid not null references levels(id) on delete cascade,
  video_url text not null,
  thumbnail_url text not null,
  duration text not null,
  created_at timestamptz not null default now()
);

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  start_time double precision not null check (start_time >= 0),
  end_time double precision not null check (end_time > start_time),
  text text not null
);

create table learner_profiles (
  id uuid primary key default gen_random_uuid(),
  learner_key text not null unique,
  contact_type text check (contact_type in ('email', 'whatsapp')),
  contact_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learner_saved_words (
  id uuid primary key default gen_random_uuid(),
  learner_key text not null references learner_profiles(learner_key) on delete cascade,
  word text not null,
  normalized_word text not null,
  translation text not null,
  sentence text not null,
  video_id uuid not null references videos(id) on delete cascade,
  video_title text not null,
  status text not null default 'saved' check (status in ('saved', 'learned')),
  saved_at timestamptz not null default now(),
  learned_at timestamptz,
  reminder_due_at timestamptz not null default (now() + interval '24 hours'),
  reminder_sent_at timestamptz
);

create index videos_level_id_idx on videos(level_id);
create index transcripts_video_id_idx on transcripts(video_id);
create index transcripts_video_start_time_idx on transcripts(video_id, start_time);
create index learner_saved_words_learner_key_idx on learner_saved_words(learner_key);
create index learner_saved_words_due_idx on learner_saved_words(reminder_due_at)
  where status = 'saved' and reminder_sent_at is null;
create unique index learner_saved_words_unique_active_idx
  on learner_saved_words(learner_key, video_id, normalized_word)
  where status = 'saved';

-- Row level security for public read access
alter table levels enable row level security;
alter table videos enable row level security;
alter table transcripts enable row level security;
alter table learner_profiles enable row level security;
alter table learner_saved_words enable row level security;

create policy "Public read levels"
  on levels for select
  to anon, authenticated
  using (true);

create policy "Public read videos"
  on videos for select
  to anon, authenticated
  using (true);

create policy "Public read transcripts"
  on transcripts for select
  to anon, authenticated
  using (true);

-- Storage bucket for uploaded local files from /admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos',
  'videos',
  true,
  1073741824,
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Public read videos bucket objects" on storage.objects;
create policy "Public read videos bucket objects"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'videos');

drop policy if exists "Service role manage videos bucket objects" on storage.objects;
create policy "Service role manage videos bucket objects"
  on storage.objects for all
  to service_role
  using (bucket_id = 'videos')
  with check (bucket_id = 'videos');

-- Seed levels
insert into levels (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'A1'),
  ('22222222-2222-2222-2222-222222222222', 'A2'),
  ('33333333-3333-3333-3333-333333333333', 'B1'),
  ('44444444-4444-4444-4444-444444444444', 'B2'),
  ('55555555-5555-5555-5555-555555555555', 'C1'),
  ('66666666-6666-6666-6666-666666666666', 'C2');

-- Seed videos
insert into videos (id, title, description, level_id, video_url, thumbnail_url, duration)
values
  (
    'a1a1a1a1-0000-0000-0000-000000000001',
    'German Greetings for Beginners',
    'Core greetings, introductions, and polite phrases for first conversations.',
    '11111111-1111-1111-1111-111111111111',
    'https://www.youtube.com/watch?v=IJiHDmyhE1A',
    'https://i.ytimg.com/vi/IJiHDmyhE1A/hqdefault.jpg',
    '05:12'
  ),
  (
    'a2a2a2a2-0000-0000-0000-000000000002',
    'Daily Routine in German (A2)',
    'Understand and describe daily activities with practical A2 sentence structures.',
    '22222222-2222-2222-2222-222222222222',
    'https://www.youtube.com/watch?v=lzK6xLzM8QY',
    'https://i.ytimg.com/vi/lzK6xLzM8QY/hqdefault.jpg',
    '07:03'
  ),
  (
    'b1b1b1b1-0000-0000-0000-000000000003',
    'Talking About Travel Plans',
    'Practice B1 connectors and tenses while discussing travel arrangements.',
    '33333333-3333-3333-3333-333333333333',
    'https://www.youtube.com/watch?v=9U8m2M0w2fI',
    'https://i.ytimg.com/vi/9U8m2M0w2fI/hqdefault.jpg',
    '08:40'
  ),
  (
    'b2b2b2b2-0000-0000-0000-000000000004',
    'Argumentation in German',
    'Build persuasive arguments with B2-level linking expressions and precision.',
    '44444444-4444-4444-4444-444444444444',
    'https://www.youtube.com/watch?v=2mXQxKktd0M',
    'https://i.ytimg.com/vi/2mXQxKktd0M/hqdefault.jpg',
    '10:15'
  ),
  (
    'c1c1c1c1-0000-0000-0000-000000000005',
    'Formal German for Work',
    'Advanced structures for business communication, meetings, and reports.',
    '55555555-5555-5555-5555-555555555555',
    'https://www.youtube.com/watch?v=R3Q8e6z6nq8',
    'https://i.ytimg.com/vi/R3Q8e6z6nq8/hqdefault.jpg',
    '11:21'
  ),
  (
    'c2c2c2c2-0000-0000-0000-000000000006',
    'Nuanced German Expressions',
    'C2-level idiomatic usage and subtle register shifts in real contexts.',
    '66666666-6666-6666-6666-666666666666',
    'https://www.youtube.com/watch?v=Q0h7S7A6dzY',
    'https://i.ytimg.com/vi/Q0h7S7A6dzY/hqdefault.jpg',
    '09:54'
  );

-- Seed transcripts for one full video and short samples for others
insert into transcripts (id, video_id, start_time, end_time, text)
values
  ('aa000001-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000001', 0.0, 4.8, 'Hallo! Willkommen zu deiner ersten Deutschlektion.'),
  ('aa000002-0000-0000-0000-000000000002', 'a1a1a1a1-0000-0000-0000-000000000001', 4.8, 9.5, 'Heute lernen wir einfache Begruessungen.'),
  ('aa000003-0000-0000-0000-000000000003', 'a1a1a1a1-0000-0000-0000-000000000001', 9.5, 15.2, 'Du kannst sagen: Guten Morgen!'),
  ('aa000004-0000-0000-0000-000000000004', 'a1a1a1a1-0000-0000-0000-000000000001', 15.2, 20.1, 'Oder am Abend: Guten Abend!'),
  ('aa000005-0000-0000-0000-000000000005', 'a1a1a1a1-0000-0000-0000-000000000001', 20.1, 25.8, 'Wenn du locker sprechen willst, sage einfach: Hi!'),
  ('aa000006-0000-0000-0000-000000000006', 'a1a1a1a1-0000-0000-0000-000000000001', 25.8, 31.2, 'Bei Abschieden passt: Tschuess und bis spaeter.'),
  ('aa000007-0000-0000-0000-000000000007', 'a1a1a1a1-0000-0000-0000-000000000001', 31.2, 37.0, 'Jetzt ueben wir einen kurzen Dialog zusammen.'),
  ('aa000008-0000-0000-0000-000000000008', 'a1a1a1a1-0000-0000-0000-000000000001', 37.0, 42.8, 'Person A sagt: Guten Tag, wie geht es dir?'),
  ('aa000009-0000-0000-0000-000000000009', 'a1a1a1a1-0000-0000-0000-000000000001', 42.8, 48.3, 'Person B antwortet: Mir geht es gut, danke!'),
  ('aa000010-0000-0000-0000-000000000010', 'a1a1a1a1-0000-0000-0000-000000000001', 48.3, 54.6, 'Sehr gut! Wiederhole die Saetze laut.'),

  ('bb000001-0000-0000-0000-000000000001', 'a2a2a2a2-0000-0000-0000-000000000002', 0.0, 5.3, 'Ich stehe jeden Tag um sieben Uhr auf.'),
  ('bb000002-0000-0000-0000-000000000002', 'a2a2a2a2-0000-0000-0000-000000000002', 5.3, 10.8, 'Dann fruehstuecke ich und fahre zur Arbeit.'),

  ('cc000001-0000-0000-0000-000000000001', 'b1b1b1b1-0000-0000-0000-000000000003', 0.0, 6.2, 'Naechsten Sommer moechte ich nach Berlin reisen.'),
  ('cc000002-0000-0000-0000-000000000002', 'b1b1b1b1-0000-0000-0000-000000000003', 6.2, 11.4, 'Dafuer muss ich rechtzeitig ein Hotel buchen.'),

  ('dd000001-0000-0000-0000-000000000001', 'b2b2b2b2-0000-0000-0000-000000000004', 0.0, 6.0, 'Meiner Ansicht nach ist dieser Vorschlag am effektivsten.'),
  ('dd000002-0000-0000-0000-000000000002', 'b2b2b2b2-0000-0000-0000-000000000004', 6.0, 12.5, 'Allerdings sollten wir auch die Kosten beruecksichtigen.'),

  ('ee000001-0000-0000-0000-000000000001', 'c1c1c1c1-0000-0000-0000-000000000005', 0.0, 5.9, 'Im heutigen Meeting praesentieren wir die Quartalsziele.'),
  ('ee000002-0000-0000-0000-000000000002', 'c1c1c1c1-0000-0000-0000-000000000005', 5.9, 11.7, 'Bitte beachten Sie die Priorisierung der Massnahmen.'),

  ('ff000001-0000-0000-0000-000000000001', 'c2c2c2c2-0000-0000-0000-000000000006', 0.0, 6.3, 'Diese Redewendung wirkt je nach Kontext ironisch oder ernst.'),
  ('ff000002-0000-0000-0000-000000000002', 'c2c2c2c2-0000-0000-0000-000000000006', 6.3, 12.8, 'Genau diese Nuance macht fortgeschrittenes Deutsch aus.');
