import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LearnerContactType } from '@/types/database';

export const runtime = 'nodejs';

interface DueWordRow {
  id: string;
  learner_key: string;
  word: string;
  translation: string;
  video_title: string;
}

interface ProfileRow {
  learner_key: string;
  contact_type: LearnerContactType | null;
  contact_value: string | null;
}

function getBaseUrl() {
  const direct = process.env.NEXT_PUBLIC_APP_URL;
  if (direct && /^https?:\/\//.test(direct)) {
    return direct.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

function buildDigest(params: { words: DueWordRow[]; learnerKey: string }) {
  const { words, learnerKey } = params;
  const lines = words.map((word, index) => {
    return `${index + 1}. ${word.word} -> ${word.translation} (${word.video_title})`;
  });

  const quizLink = `${getBaseUrl()}/saved?learner=${encodeURIComponent(learnerKey)}`;
  const text = `Your saved German words are ready for review:\n\n${lines.join('\n')}\n\nOpen your quiz: ${quizLink}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h2 style="margin:0 0 12px;">Your XLang 24-hour vocabulary review</h2>
      <p style="margin:0 0 12px;">These saved words are ready for quiz practice:</p>
      <ol style="margin:0 0 14px;padding-left:18px;">
        ${words
          .map(
            (word) =>
              `<li><strong>${word.word}</strong> -> ${word.translation} <span style="color:#666;">(${word.video_title})</span></li>`
          )
          .join('')}
      </ol>
      <p style="margin:0 0 8px;">
        <a href="${quizLink}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">
          Open Quiz
        </a>
      </p>
      <p style="margin:0;color:#666;font-size:13px;">Or open: <a href="${quizLink}">${quizLink}</a></p>
    </div>
  `;

  return { text, html };
}

async function sendEmail(params: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error('Email provider is not configured (RESEND_API_KEY, REMINDER_FROM_EMAIL).');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend error (${response.status}): ${body}`);
  }
}

async function sendWhatsApp(params: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'WhatsApp provider is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM).'
    );
  }

  const formBody = new URLSearchParams({
    To: params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    Body: params.body
  });

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody.toString()
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twilio error (${response.status}): ${body}`);
  }
}

async function handleDispatch(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    const cronSecret = process.env.CRON_SECRET;
    if (
      cronSecret &&
      !vercelCronHeader &&
      authHeader !== `Bearer ${cronSecret}`
    ) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    const { data: dueWords, error: dueWordsError } = await supabase
      .from('learner_saved_words')
      .select('id, learner_key, word, translation, video_title')
      .eq('status', 'saved')
      .is('reminder_sent_at', null)
      .lte('reminder_due_at', nowIso);

    if (dueWordsError) {
      return NextResponse.json(
        { error: `Failed to load due reminders: ${dueWordsError.message}` },
        { status: 500 }
      );
    }

    if (!dueWords || dueWords.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 0 });
    }

    const grouped = dueWords.reduce<Record<string, DueWordRow[]>>((acc, row) => {
      if (!acc[row.learner_key]) {
        acc[row.learner_key] = [];
      }
      acc[row.learner_key].push(row);
      return acc;
    }, {});

    const learnerKeys = Object.keys(grouped);
    const { data: profiles, error: profilesError } = await supabase
      .from('learner_profiles')
      .select('learner_key, contact_type, contact_value')
      .in('learner_key', learnerKeys);

    if (profilesError) {
      return NextResponse.json(
        { error: `Failed to load learner contacts: ${profilesError.message}` },
        { status: 500 }
      );
    }

    const profilesMap = new Map<string, ProfileRow>();
    (profiles ?? []).forEach((profile) => {
      profilesMap.set(profile.learner_key, profile);
    });

    const sentWordIds: string[] = [];
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const learnerKey of learnerKeys) {
      const words = grouped[learnerKey];
      const profile = profilesMap.get(learnerKey);

      if (!profile?.contact_type || !profile.contact_value) {
        skipped += words.length;
        continue;
      }

      const digest = buildDigest({ words, learnerKey });
      const subject = `XLang review: ${words.length} saved word${words.length > 1 ? 's' : ''}`;

      try {
        if (profile.contact_type === 'email') {
          await sendEmail({
            to: profile.contact_value,
            subject,
            html: digest.html,
            text: digest.text
          });
        } else {
          await sendWhatsApp({
            to: profile.contact_value,
            body: digest.text
          });
        }

        sent += words.length;
        sentWordIds.push(...words.map((word) => word.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider error.';
        errors.push(`${learnerKey}: ${message}`);
      }
    }

    if (sentWordIds.length > 0) {
      const { error: updateError } = await supabase
        .from('learner_saved_words')
        .update({ reminder_sent_at: nowIso })
        .in('id', sentWordIds);

      if (updateError) {
        return NextResponse.json(
          { error: `Notifications sent, but update failed: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      skipped,
      errors
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleDispatch(request);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
