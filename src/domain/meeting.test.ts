import { describe, expect, it } from 'vitest';
import {
  browserTimeZone,
  MEETING_LINK_MAX,
  meetingLinkLabel,
  parseMeetingLink,
  parseTimeZone,
  timeZoneChoices,
} from './meeting';

const accepted = (raw: string) => {
  const result = parseMeetingLink(raw);
  if (!result.ok) throw new Error(`${raw} was refused: ${result.message}`);
  return result.link;
};

const refusal = (raw: string) => {
  const result = parseMeetingLink(raw);
  return result.ok ? null : result.message;
};

describe('a meeting link', () => {
  it('takes an https address and keeps it exactly as it will be handed on', () => {
    expect(accepted('https://us02web.zoom.us/j/9876543210?pwd=aBcD')).toEqual({
      value: 'https://us02web.zoom.us/j/9876543210?pwd=aBcD',
      kind: 'zoom',
    });
  });

  it('is optional: an empty box, spaces only, nothing at all', () => {
    for (const raw of ['', '   ', '\n\t ']) expect(parseMeetingLink(raw)).toEqual({ ok: true, link: null });
  });

  it('trims what was pasted and lower-cases only the scheme, because the rest of an address can be case sensitive', () => {
    expect(accepted('  HTTPS://meet.google.com/aBc-dEfg-hij  ')).toEqual({
      value: 'https://meet.google.com/aBc-dEfg-hij',
      kind: 'meet',
    });
  });

  it('names the three rooms people use, and calls everything else a link', () => {
    const kinds = (raw: string) => accepted(raw)?.kind;
    expect(kinds('https://zoom.us/my/firstname')).toBe('zoom');
    expect(kinds('https://booth.zoom.us/j/123')).toBe('zoom');
    expect(kinds('https://gsa.zoomgov.com/j/123')).toBe('zoom');
    expect(kinds('https://meet.google.com/abc-defg-hij')).toBe('meet');
    expect(kinds('https://teams.microsoft.com/l/meetup-join/19%3ameeting')).toBe('teams');
    expect(kinds('https://teams.live.com/meet/9360')).toBe('teams');
    expect(kinds('https://chicagobooth.webex.com/meet/student')).toBe('other');
    expect(kinds('https://whereby.com/caselab')).toBe('other');
    // A host that only ends in the same letters is not Zoom.
    expect(kinds('https://notzoom.us.example.com/j/1')).toBe('other');
  });

  it('takes a phone number with digits, spaces, dashes and an optional +', () => {
    expect(accepted('+1 773-555-0134')).toEqual({ value: '+1 773-555-0134', kind: 'phone' });
    expect(accepted('07700 900123')).toEqual({ value: '07700 900123', kind: 'phone' });
    expect(accepted('+91 98765 43210')?.kind).toBe('phone');
  });

  it('refuses a phone number that is too short or too long to be one', () => {
    expect(refusal('12345')).toMatch(/7 and 15 digits/);
    expect(refusal('+1234567890123456')).toMatch(/7 and 15 digits/);
    expect(refusal('+1 773-555-0134-')).toMatch(/https:\/\//); // a dangling dash is not a number at all
  });

  describe('refuses anything that is not one of those two', () => {
    it.each([
      ['javascript:alert(document.cookie)'],
      ['JavaScript:alert(1)'],
      ['javascript:void(0)//https://zoom.us/j/1'],
      ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
      ['data:text/plain,hello'],
      ['vbscript:msgbox(1)'],
      ['file:///C:/Users/me/room.html'],
      ['tel:+17735550134'],
      ['mailto:me@example.com'],
      ['http://us02web.zoom.us/j/9876543210'],
      ['HTTP://zoom.us/j/1'],
      ['//evil.example.com/j/1'],
      ['/rooms/mine'],
      ['../rooms/mine'],
      ['rooms/mine'],
      ['zoom.us/j/9876543210'],
      ['www.zoom.us/j/1'],
      ['Ping me on Slack and I will send the link'],
      ['https:/zoom.us/j/1'],
      ['https://'],
      ['https://localhost:5173/room'],
      ['https://zoom'],
      ['https://zoom.us/j/1 and then https://evil.example.com'],
      ['https://zoom.us/j/1\njavascript:alert(1)'],
      ['<a href="https://zoom.us/j/1">my room</a>'],
      ['0000'],
      ['+'],
      ['1 (773) 555-0134'], // brackets are not in the rule the database enforces
    ])('%s', (raw) => {
      const result = parseMeetingLink(raw);
      expect(result.ok, `${raw} was accepted`).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(10);
    });
  });

  it('says what to do instead, in plain words', () => {
    expect(refusal('http://zoom.us/j/1')).toBe('Use the https:// address — http:// is not secure enough to pass on.');
    expect(refusal('javascript:alert(1)')).toBe('A meeting link has to start with https://. Paste the address your meeting room opens at.');
    expect(refusal('see you on Zoom')).toBe('Paste a link starting with https://, or a phone number.');
    expect(refusal(`https://zoom.us/j/${'9'.repeat(MEETING_LINK_MAX)}`)).toMatch(/longer than 300 characters/);
  });

  it('takes a link right up to the limit and refuses the character after it', () => {
    const pad = (length: number) => `https://zoom.us/j/${'9'.repeat(length - 'https://zoom.us/j/'.length)}`;
    expect(parseMeetingLink(pad(MEETING_LINK_MAX)).ok).toBe(true);
    expect(parseMeetingLink(pad(MEETING_LINK_MAX + 1)).ok).toBe(false);
  });

  it('has a name for each kind', () => {
    expect(meetingLinkLabel('zoom')).toBe('Zoom');
    expect(meetingLinkLabel('meet')).toBe('Google Meet');
    expect(meetingLinkLabel('teams')).toBe('Microsoft Teams');
    expect(meetingLinkLabel('phone')).toBe('Phone');
    expect(meetingLinkLabel('other')).toBe('Link');
  });
});

describe('a time zone', () => {
  it('takes an IANA name, however many parts it has', () => {
    expect(parseTimeZone('America/Chicago')).toEqual({ ok: true, zone: 'America/Chicago' });
    expect(parseTimeZone(' Asia/Kolkata ')).toEqual({ ok: true, zone: 'Asia/Kolkata' });
    expect(parseTimeZone('America/Argentina/Buenos_Aires').ok).toBe(true);
    expect(parseTimeZone('Etc/GMT+5').ok).toBe(true);
    expect(parseTimeZone('UTC')).toEqual({ ok: true, zone: 'UTC' });
  });

  it('is optional', () => {
    expect(parseTimeZone('')).toEqual({ ok: true, zone: null });
    expect(parseTimeZone('   ')).toEqual({ ok: true, zone: null });
  });

  it.each([
    ['Chicago'],
    ['CST'],
    ['GMT+5'],
    ['-05:00'],
    ['America/Chicago; drop table'],
    ["America/Chicago'"],
    ['America//Chicago'],
    ['/Chicago'],
    ['America/'],
    ['America/Chicago extra'],
    ['A/'.repeat(40)],
  ])('refuses %s', (raw) => {
    const result = parseTimeZone(raw);
    expect(result.ok, `${raw} was accepted`).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Pick a time zone/);
  });

  it('refuses a well-shaped name the browser has never heard of, when the browser has a list', () => {
    const known = ['America/Chicago', 'Europe/London'];
    expect(parseTimeZone('America/Chicago', known).ok).toBe(true);
    expect(parseTimeZone('Mars/Olympus_Mons', known).ok).toBe(false);
    // No list (an old browser): the shape is all we can ask for, and the database still has the last word.
    expect(parseTimeZone('Mars/Olympus_Mons').ok).toBe(true);
    expect(parseTimeZone('Mars/Olympus_Mons', []).ok).toBe(true);
  });
});

describe('what the browser offers', () => {
  it('lists real zones, including the one the member is probably in', () => {
    const zones = timeZoneChoices();
    expect(zones.length).toBeGreaterThan(10);
    expect(zones).toContain('America/Chicago');
    for (const zone of zones) expect(parseTimeZone(zone).ok, zone).toBe(true);
  });

  it('reads this browser’s own zone, and gives nothing rather than a guess it cannot stand behind', () => {
    const guess = browserTimeZone();
    expect(guess === '' || parseTimeZone(guess).ok).toBe(true);
  });
});
