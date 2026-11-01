import { useEffect, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Sun } from 'lucide-react';
import { useTwin } from '../state/store';
import { arakTmyTime, TMY_YEAR } from '../services/siteTime';

export function Timeline() {
  const { hour, setHour, columns, timeMode, followArakTime, set, run, equipment } = useTwin();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const supportsArakClock = !run || run.metadata.scenario.weather_id === 'arak';
  useEffect(() => {
    if (timeMode !== 'arak') return;
    if (!supportsArakClock) {
      set({ timeMode: 'manual' });
      return;
    }
    const update = () => {
      if (useTwin.getState().timeMode !== 'arak') return;
      const instant = new Date();
      setNow(instant);
      followArakTime(instant);
    };
    setPlaying(false);
    update();
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [timeMode, supportsArakClock, followArakTime, set]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = useTwin.getState().hour;
      setHour((current + speed) % 8760);
    }, 800);
    return () => clearInterval(timer);
  }, [playing, speed, setHour]);
  const selectHour = (value: number) => {
    setPlaying(false);
    setHour(value);
  };
  const date = new Date(Date.UTC(TMY_YEAR, 0, 1 + Math.floor(hour / 24)));
  const day = date.toISOString().slice(0, 10);
  const clock = arakTmyTime(now);
  const offset =
    String(columns?.timestamp_local?.[hour] ?? '').match(/([+-]\d{2}:\d{2})$/)?.[1] ?? '+03:30';
  return (
    <div className="timeline">
      <div className="timeline-top">
        <div className="timeline-heading">
          <div className="timeline-label">
            <Sun size={17} />
            <strong>Reference-year timeline</strong>
            <span>Hourly · local standard time</span>
          </div>
        </div>
        <div className="timeline-inputs">
          <label>
            Month
            <select
              aria-label="Timeline month"
              value={date.getUTCMonth()}
              onChange={(e) =>
                selectHour(
                  (Date.UTC(TMY_YEAR, Number(e.target.value), 1) - Date.UTC(TMY_YEAR, 0, 1)) /
                    3600000 +
                    (hour % 24),
                )
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {new Date(TMY_YEAR, i, 1).toLocaleDateString('en-GB', { month: 'short' })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Day
            <input
              aria-label="Timeline date"
              type="date"
              value={day}
              min="2001-01-01"
              max="2001-12-31"
              onChange={(e) => {
                const value = Date.parse(e.target.value + 'T00:00:00Z');
                if (Number.isFinite(value))
                  selectHour((value - Date.UTC(TMY_YEAR, 0, 1)) / 3600000 + (hour % 24));
              }}
            />
          </label>
          <label>
            Hour
            <input
              aria-label="Timeline hour"
              type="number"
              min={0}
              max={23}
              value={hour % 24}
              onChange={(e) => selectHour(Math.floor(hour / 24) * 24 + Number(e.target.value))}
            />
          </label>
        </div>
      </div>
      {timeMode === 'arak' && (
        <div className="site-clock-status">
          <span className="status-dot" />
          <span>
            <strong>Arak now</strong>{' '}
            <time dateTime={now.toISOString()}>
              {clock.localDate} · {clock.localTime}
            </time>{' '}
            · Asia/Tehran
          </span>
          <span className="site-clock-source">
            TMY hourly values · {String(hour % 24).padStart(2, '0')}:00–
            {String((hour % 24) + 1).padStart(2, '0')}:00
          </span>
          {clock.leapDay && <span>29 Feb uses 28 Feb TMY (365-day dataset).</span>}
          {equipment?.hour !== hour && <span>Updating equipment for this hour…</span>}
        </div>
      )}
      <div className="timeline-bottom">
        <button
          className="icon-button"
          aria-label="Previous hour"
          onClick={() => selectHour(hour - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? 'Pause playback' : 'Play playback'}
          onClick={() => {
            set({ timeMode: 'manual' });
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-button" aria-label="Next hour" onClick={() => selectHour(hour + 1)}>
          <ChevronRight size={17} />
        </button>
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          {[1, 6, 24].map((x) => (
            <option key={x} value={x}>
              {x}×
            </option>
          ))}
        </select>
        <input
          aria-label="Simulation timeline"
          className="time-slider"
          type="range"
          min={0}
          max={8759}
          value={hour}
          onChange={(e) => selectHour(Number(e.target.value))}
        />
        <span className="timeline-time">
          {day.slice(8)} {date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })} ·{' '}
          {String(hour % 24).padStart(2, '0')}:00 <small>UTC{offset}</small>
        </span>
      </div>
    </div>
  );
}
