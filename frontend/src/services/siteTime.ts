export const ARAK_TIME_ZONE = 'Asia/Tehran';
export const TMY_YEAR = 2001;

const arakClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: ARAK_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Select the hourly TMY interval containing the current civil time in Arak.
 * The weather has 365 days: February 29 deliberately reuses February 28.
 * No minute-level weather or interpolation is invented.
 */
export function arakTmyTime(instant: Date) {
  const parts = Object.fromEntries(arakClock.formatToParts(instant).map((p) => [p.type, p.value]));
  const month = Number(parts.month),
    day = Number(parts.day),
    hour = Number(parts.hour);
  const leapDay = month === 2 && day === 29;
  const tmyDay = leapDay ? 28 : day;
  return {
    hourOfYear: (Date.UTC(TMY_YEAR, month - 1, tmyDay, hour) - Date.UTC(TMY_YEAR, 0, 1)) / 3600000,
    localDate: `${day} ${months[month - 1]} ${parts.year}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
    leapDay,
  };
}
