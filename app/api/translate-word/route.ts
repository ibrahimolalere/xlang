import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const cache = new Map<string, string>();

const fallbackDictionary: Record<string, string> = {
  hallo: 'hello',
  guten: 'good',
  morgen: 'morning',
  abend: 'evening',
  danke: 'thanks',
  bitte: 'please',
  tschuess: 'bye',
  und: 'and',
  ich: 'I',
  du: 'you',
  ist: 'is',
  wir: 'we',
  lernen: 'learn',
  deutsch: 'german'
};

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, ' ')
    .replace(/[Ä]/g, 'ä')
    .replace(/[Ö]/g, 'ö')
    .replace(/[Ü]/g, 'ü')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeTranslation(value: string) {
  return value.replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '').trim();
}

function parseGoogleTranslatePayload(payload: unknown) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return '';
  }

  const translated = (payload[0] as unknown[])
    .map((entry) => (Array.isArray(entry) ? String(entry[0] ?? '') : ''))
    .join('')
    .trim();

  return sanitizeTranslation(translated);
}

async function translateWithGoogle(input: string): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'de');
  url.searchParams.set('tl', 'en');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', input);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json,text/plain,*/*'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Google Translate failed: HTTP ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const parsed = parseGoogleTranslatePayload(payload);
  if (!parsed) {
    throw new Error('Google Translate returned an empty translation.');
  }

  return parsed;
}

async function translateWithMyMemory(input: string): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', input);
  url.searchParams.set('langpair', 'de|en');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`MyMemory failed: HTTP ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        responseData?: { translatedText?: string };
      }
    | null;

  const translated = sanitizeTranslation(
    String(payload?.responseData?.translatedText ?? '')
  );
  if (!translated) {
    throw new Error('MyMemory returned an empty translation.');
  }

  return translated;
}

async function translateWithOpenAI(input: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Translate German input to concise English. Input can be one word or a short phrase. Return only the translation in lowercase.'
      },
      {
        role: 'user',
        content: input
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  const translation = sanitizeTranslation(raw);
  if (!translation) {
    throw new Error('OpenAI returned an empty translation.');
  }

  return translation;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { word?: string; text?: string };
    const rawInput = String(body.text ?? body.word ?? '').trim();
    const normalizedInput = normalizeInput(rawInput);

    if (!normalizedInput) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    }

    const cached = cache.get(normalizedInput);
    if (cached) {
      return NextResponse.json({ translation: cached });
    }

    const isSingleWord = !normalizedInput.includes(' ');
    if (isSingleWord && fallbackDictionary[normalizedInput]) {
      const translation = fallbackDictionary[normalizedInput];
      cache.set(normalizedInput, translation);
      return NextResponse.json({ translation });
    }

    const attempts: Array<() => Promise<string>> = [
      () => translateWithGoogle(rawInput),
      () => translateWithMyMemory(rawInput),
      () => translateWithOpenAI(rawInput)
    ];

    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        const translation = await attempt();
        if (translation && translation.toLowerCase() !== 'translation unavailable') {
          cache.set(normalizedInput, translation);
          return NextResponse.json({ translation });
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'unknown translation error');
      }
    }

    return NextResponse.json(
      {
        translation: 'translation unavailable',
        error: errors.join(' | ')
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json({ translation: 'translation unavailable' }, { status: 500 });
  }
}
