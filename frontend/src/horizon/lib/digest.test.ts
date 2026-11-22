import { describe, expect, it } from 'vitest';
import { fromLabel, humanize, initials, kindCounts, parseDigest, sourceName, timeLabel, titleHeadline } from './digest';

describe('digest', () => {
  it('turns the sections into items and the first line into a headline', () => {
    const d = parseDigest({
      text: '# Good morning\nThree things matter today.\n\nMore below.',
      sections: { news_rss: 'A new database launched.', empty: '  ', notes: '## Notes\nYou wrote 4 notes.' },
      sources_used: ['RSS', 'Slack'],
      generated_at: '2026-10-18T09:30:00',
      model_used: 'qwen3.5:4b',
    });
    expect(d.headline).toBe('Good morning');
    expect(d.summary).toBe('Three things matter today. More below.');
    expect(d.items.map((i) => i.title)).toEqual(['RSS', 'Notes']);
    expect(d.items[1].text).toBe('Notes\nYou wrote 4 notes.');
    expect(d.sources).toHaveLength(2);
  });

  it('keeps a number that starts the headline but drops list markers', () => {
    const d = parseDigest({ text: '3 new items from 2 sources\n1. First' });
    expect(d.headline).toBe('3 New Items From 2 Sources');
    expect(d.summary).toBe('First');
  });

  it('falls back to the paragraphs when there are no sections', () => {
    const d = parseDigest({ text: 'Headline\n\nFirst point.\n\nSecond point.' });
    expect(d.items.map((i) => i.text)).toEqual(['First point.', 'Second point.']);
  });

  it('shortens a long headline and copes with an empty digest', () => {
    expect(parseDigest({ text: 'x'.repeat(200) }).headline).toHaveLength(90);
    expect(parseDigest({}).headline).toBe('Your digest');
  });

  it('writes names, initials and times', () => {
    expect(humanize('morning_news-feed')).toBe('Morning News Feed');
    expect(initials('News Daily')).toBe('ND');
    const now = new Date(2026, 9, 18, 12, 0);
    expect(timeLabel(new Date(2026, 9, 18, 9, 5), now)).toBe('Today 09:05');
    expect(timeLabel(new Date(2026, 9, 17, 23, 0), now)).toBe('Yesterday 23:00');
    expect(timeLabel(new Date(2026, 9, 12, 8, 0), now)).toBe('12 Oct 08:00');
  });

  it('writes the count headline in title case', () => {
    expect(titleHeadline('5 new items from 1 source')).toBe('5 New Items From 1 Source');
    expect(titleHeadline('1 new item from 2 sources')).toBe('1 New Item From 2 Sources');
    expect(titleHeadline('Good morning')).toBe('Good morning');
  });

  it('names the sources as people know them and counts the items', () => {
    expect(sourceName('news_rss')).toBe('RSS');
    expect(sourceName('gmail_imap')).toBe('Gmail');
    expect(sourceName('daily_paper')).toBe('Daily Paper');
    const d = parseDigest({ text: '5 New Items From 1 Source\nok', sections: { news_rss: 'x' }, sources_used: ['news_rss'] });
    expect([d.count, d.items[0].title, d.sources]).toEqual([5, 'RSS', ['RSS']]);
    expect(parseDigest({ text: 'Hello', sections: { a: 'x', b: 'y' } }).count).toBe(2);
  });

  it('turns the items of the server into small blocks and counts them by kind', () => {
    const raw = {
      text: '3 New Items From 2 Sources\nok',
      items: [
        { source: 'news_rss', source_name: 'RSS', kind: 'rss', title: 'A new database', summary: 'Launched today.', text: 'Launched today. It is fast.', url: 'https://x.dev', time: '2026-10-20T09:00:00', origin: 'Sandeco' },
        { source: 'gmail', kind: 'mail', title: 'Weekly', summary: 's', text: 't' },
        { source: 'slack', kind: 'whatever', title: 'N', summary: '', text: '', time: 'not a date' },
      ],
    };
    const d = parseDigest(raw);
    expect(d.blocks.map((b) => [b.sourceName, b.kind])).toEqual([['RSS', 'rss'], ['Gmail', 'mail'], ['Slack', 'other']]);
    expect(d.blocks[0].time?.getHours()).toBe(9);
    expect(d.blocks[2].time).toBeNull();
    expect(d.count).toBe(3);
    expect(kindCounts(d.blocks)).toEqual([{ kind: 'rss', count: 1 }, { kind: 'mail', count: 1 }]);
    expect(parseDigest({ text: 'Hello' }).blocks).toEqual([]);
  });

  it('names the feed or channel an item came from, when it says so', () => {
    const d = parseDigest({ text: 'x', items: [
      { source: 'news_rss', source_name: 'RSS', kind: 'rss', title: 'A', origin: 'Sandeco' },
      { source: 'news_rss', source_name: 'RSS', kind: 'rss', title: 'B' },
    ] });
    expect(d.blocks.map(fromLabel)).toEqual(['RSS · Sandeco', 'RSS']);
  });
});
