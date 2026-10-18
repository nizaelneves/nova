import { describe, expect, it } from 'vitest';
import { addMeeting, removeMeeting, sortMeetings, updateMeeting } from './meetings';

describe('meetings', () => {
  it('adds an empty meeting first, edits it and removes it', () => {
    const first = addMeeting([], '2026-10-10');
    const second = addMeeting(first.list, '2026-10-12');
    expect(second.list[0]).toBe(second.meeting);
    expect(second.meeting).toMatchObject({ title: '', date: '2026-10-12', notes: '' });
    const edited = updateMeeting(second.list, first.meeting.id, { title: 'Kickoff' });
    expect(edited.find((m) => m.id === first.meeting.id)?.title).toBe('Kickoff');
    expect(removeMeeting(edited, first.meeting.id)).toHaveLength(1);
  });

  it('lists the newest day first', () => {
    const a = addMeeting([], '2026-10-01');
    const b = addMeeting(a.list, '2026-10-20');
    expect(sortMeetings(b.list).map((m) => m.date)).toEqual(['2026-10-20', '2026-10-01']);
  });
});
