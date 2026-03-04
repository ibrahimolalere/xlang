import OpenAI from 'openai';
import { NextResponse } from 'next/server';

import { normalizeWord } from '@/lib/video/subtitle-utils';

export const runtime = 'nodejs';

const storyCache = new Map<string, string>();

function sanitizeWords(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  const words: string[] = [];
  const seen = new Set<string>();

  for (const value of input) {
    const word = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48);
    const normalized = normalizeWord(word);
    if (!word || !normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    words.push(word);
    if (words.length >= 10) {
      break;
    }
  }

  return words;
}

function buildFallbackStory(words: string[]) {
  const safe = [...words];
  while (safe.length < 10) {
    safe.push(words[words.length - 1] ?? 'Wort');
  }

  const [w1, w2, w3, w4, w5, w6, w7, w8, w9, w10] = safe;
  return [
    `Heute übe ich ${w1}, ${w2} und ${w3}.`,
    `Später benutze ich ${w4}, ${w5}, ${w6} und ${w7} in einem kurzen Gespräch.`,
    `Am Abend wiederhole ich ${w8}, ${w9} und ${w10}.`
  ].join(' ');
}

function ensureWordsIncluded(story: string, words: string[]) {
  const tokens = story
    .split(/(\s+|[.,!?;:"(){}\[\]„“‚‘…—–-])/g)
    .map((token) => normalizeWord(token))
    .filter(Boolean);
  const tokenSet = new Set(tokens);

  const missing = words.filter((word) => !tokenSet.has(normalizeWord(word)));
  if (missing.length === 0) {
    return story;
  }

  return `${story} Außerdem wiederhole ich ${missing.join(', ')}.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { words?: unknown } | null;
    const words = sanitizeWords(body?.words);

    if (words.length < 10) {
      return NextResponse.json(
        { error: 'Provide 10 saved words to generate a review story.' },
        { status: 400 }
      );
    }

    const cacheKey = words.map((word) => normalizeWord(word)).join('|');
    const cached = storyCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ story: cached, source: 'cache' });
    }

    const fallback = ensureWordsIncluded(buildFallbackStory(words), words);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      storyCache.set(cacheKey, fallback);
      return NextResponse.json({ story: fallback, source: 'fallback-no-key' });
    }

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are a German tutor. Write a very short, coherent German story for language learners (A1-A2 style). Keep it 2-3 sentences and natural. You must include every provided word exactly as written at least once. Do not output lists, only the story text.'
        },
        {
          role: 'user',
          content: `Use exactly these words in the story: ${words.join(', ')}`
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const nextStory = ensureWordsIncluded(raw || fallback, words);

    storyCache.set(cacheKey, nextStory);
    return NextResponse.json({ story: nextStory, source: raw ? 'openai' : 'fallback-empty' });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Story generation failed: ${error.message}`
            : 'Story generation failed.'
      },
      { status: 500 }
    );
  }
}
