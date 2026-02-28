# XLang German Video Learning Platform

## Stack
- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL)
- `react-player` for YouTube + direct uploaded video URLs

## Routes
- `/` level selection
- `/level/[level]` videos by CEFR level
- `/video/[id]` video player + synced transcript
- `/saved` saved vocabulary flashcards + quiz + contact reminders

## Local Setup
1. Install dependencies:
```bash
npm install
```

2. Add environment variables:
```bash
cp .env.example .env.local
```
Then update `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_UPLOAD_PASSCODE=...
SUPABASE_VIDEOS_BUCKET=videos
SUPABASE_THUMBNAILS_BUCKET=videos
OPENAI_API_KEY=... # optional, enables auto transcript extraction
NEXT_PUBLIC_APP_URL=... # used in reminder links
RESEND_API_KEY=... # optional, for email reminders
REMINDER_FROM_EMAIL=... # required when RESEND_API_KEY is set
TWILIO_ACCOUNT_SID=... # optional, for WhatsApp reminders
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
CRON_SECRET=... # optional for secured manual reminder dispatch
```

3. Create schema and seed data in Supabase SQL editor:
- Run: [`db/supabase.sql`](/Users/iolalere/Desktop/Xlang/db/supabase.sql)

4. Start dev server:
```bash
npm run dev
```

5. Open:
- `http://localhost:3000`

## Project Structure
```text
app/
  level/[level]/page.tsx
  video/[id]/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  saved-words-list.tsx
  video-player/
    fullscreen-subtitle-overlay.tsx
    playback-controls.tsx
  level-card.tsx
  providers.tsx
  theme-toggle.tsx
  video-card.tsx
  video-player-with-transcript.tsx
lib/
  learner.ts
  server/admin-video/
    index.ts
    levels.ts
    storage.ts
    transcript.ts
    youtube.ts
    types.ts
  video/
    subtitle-utils.ts
  constants.ts
  utils.ts
  supabase/server.ts
types/
  database.ts
db/
  supabase.sql
scripts/
  smoke-ui.sh
```

## Notes
- Transcript sentence is highlighted based on current playback time.
- Clicking a transcript sentence seeks video playback to sentence start time.
- Includes playback speed control, dark mode toggle, and Save Vocabulary UI.
- Saved words now sync to Supabase by anonymous learner key (stored locally).
- Learners can add email/WhatsApp and receive 24-hour review reminders.
- Quiz-correct or "mark learned" items are removed from active saved words.
- Admin upload page: `/admin` (requires passcode configured in `ADMIN_UPLOAD_PASSCODE`).
- Admin uploads local files to Supabase Storage and inserts metadata/transcripts through server API.
- Admin upload also supports YouTube link submissions and attempts timed-caption import when available.
- Run `db/supabase.sql` after pulling changes to ensure storage bucket/policies exist.
- If `OPENAI_API_KEY` is set, uploads without manual transcript lines are auto-transcribed.
- Run `npm run smoke:ui` for a route-level UI smoke test before deployment.
- Vercel cron is configured in [`vercel.json`](/Users/iolalere/Desktop/Xlang/vercel.json) to call `/api/reminders/dispatch` hourly.
