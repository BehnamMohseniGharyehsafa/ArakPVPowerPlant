import { describe, it, expect } from 'vitest';
import { arakTmyTime } from './siteTime';

describe('Arak civil time to hourly TMY mapping', () => {
  it('uses Arak rather than the browser time zone, with no minute interpolation', () => {
    const t = arakTmyTime(new Date('2026-01-01T00:05:17Z'));
    expect(t).toEqual({
      hourOfYear: 3,
      localDate: '1 Jan 2026',
      localTime: '03:35:17',
      leapDay: false,
    });
  });
  it('wraps at local midnight and New Year, rather than UTC midnight', () => {
    expect(arakTmyTime(new Date('2026-12-31T20:29:59Z')).hourOfYear).toBe(8759);
    expect(arakTmyTime(new Date('2026-12-31T20:30:00Z'))).toEqual({
      hourOfYear: 0,
      localDate: '1 Jan 2027',
      localTime: '00:00:00',
      leapDay: false,
    });
  });
  it('uses February 28 for leap day without shifting March and later months', () => {
    expect(arakTmyTime(new Date('2024-02-29T09:00:00Z'))).toEqual({
      hourOfYear: 1404,
      localDate: '29 Feb 2024',
      localTime: '12:30:00',
      leapDay: true,
    });
    expect(arakTmyTime(new Date('2024-03-01T09:00:00Z')).hourOfYear).toBe(1428);
  });
});
