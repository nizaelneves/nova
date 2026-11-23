import { streamChat } from './sse';
import type { Conversation } from '../types';

/** Memoir keeps its own conversations: they carry `space: 'memoir'` and never show in Phibe's lists. */
export const isMemoirChat = (c: Conversation) => c.space === 'memoir';
export const phibeChats = (list: Conversation[]) => list.filter((c) => !isMemoirChat(c));
export const memoirChats = (list: Conversation[]) => list.filter(isMemoirChat);

export const UNNAMED = 'New Conversation';

/** "strategy for growth" becomes "Strategy For Growth": every word starts with a capital, the rest is kept as written. */
export const titleCase = (s: string) =>
  s.replace(/["“”'`.:;!?()]/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 6).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const PROMPT = 'Name this conversation by its subject in two to four words, in English or the language of the user. No quotes, no punctuation. Examples: Briefing; Brainstorming Inove Investimentos; Strategy For Growth. Reply with the name only.';

/** The subject of a conversation as a short Title Case name; falls back to the first words of the question. */
export async function nameChat(model: string, question: string, answer: string): Promise<string> {
  const fallback = titleCase(question.split(/\s+/).slice(0, 4).join(' ')) || UNNAMED;
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), 25000);
  try {
    let out = '';
    for await (const ev of streamChat({ model, stream: true, temperature: 0.2, plain: true, messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: `${question.slice(0, 400)}\n\n${answer.slice(0, 300)}` }] }, stop.signal)) {
      if (ev.event) continue;
      try { out += (JSON.parse(ev.data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? ''; } catch { /* a chunk that is not text */ }
    }
    return titleCase(out.split('\n')[0]) || fallback;
  } catch { return fallback; } finally { window.clearTimeout(timer); }
}
