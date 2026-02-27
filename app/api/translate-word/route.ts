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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { word?: string; text?: string };
    const rawInput = String(body.text ?? body.word ?? '').trim();
    const normalizedInput = normalizeInput(rawInput);

    if (!normalizedInput) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    }

    if (cache.has(normalizedInput)) {
      return NextResponse.json({ translation: cache.get(normalizedInput) });
    }

    const isSingleWord = !normalizedInput.includes(' ');
    if (isSingleWord && fallbackDictionary[normalizedInput]) {
      const translation = fallbackDictionary[normalizedInput];
      cache.set(normalizedInput, translation);
      return NextResponse.json({ translation });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const translation = 'translation unavailable';
      cache.set(normalizedInput, translation);
      return NextResponse.json({ translation });
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
          content: rawInput
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const translation =
      raw.replace(/^["'`]|["'`]$/g, '').replace(/\.$/, '').trim() ||
      'translation unavailable';

    cache.set(normalizedInput, translation);
    return NextResponse.json({ translation });
  } catch {
    return NextResponse.json({ translation: 'translation unavailable' });
  }
}
