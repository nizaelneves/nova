import { describe, expect, it } from 'vitest';
import { addressesIn, feedMatches } from './rssFeeds';

describe('rss feed list', () => {
  it('reads addresses separated by commas or lines, once each, as https when no scheme is given', () => {
    expect(addressesIn(' a.com/feed.xml,\nhttps://b.org/rss , ,a.com/feed.xml ')).toEqual(['https://a.com/feed.xml', 'https://b.org/rss']);
    expect(addressesIn('  \n , ')).toEqual([]);
    expect(addressesIn('http://plain.dev/x')).toEqual(['http://plain.dev/x']);
  });

  it('finds a feed by part of its name or address', () => {
    const feed = { name: 'Investidor Sardinha', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1' };
    expect(['sardinha', 'CHANNEL_ID', '', '  '].map((q) => feedMatches(feed, q))).toEqual([true, true, true, true]);
    expect(feedMatches(feed, 'sandeco')).toBe(false);
  });
});
