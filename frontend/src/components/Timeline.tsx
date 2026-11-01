import { useEffect, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Sun } from 'lucide-react';
import { useTwin } from '../state/store';
export function Timeline() {
  const { hour, setHour, columns } = useTwin();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = useTwin.getState().hour;
      setHour((current + speed) % 8760);
    }, 800);
    return () => clearInterval(timer);
  }, [playing, speed, setHour]);
  const date = new Date(Date.UTC(2001, 0, 1 + Math.floor(hour / 24)));
  const day = date.toISOString().slice(0, 10);
  return (
    <div className="timeline">
      <div className="timeline-top">
        <div className="timeline-label">
          <Sun size={17} />
          <strong>Reference-year timeline</strong>
          <span>Hourly · local standard time</span>
        </div>
        <div className="timeline-inputs">
          <label>
            Month
            <select
              aria-label="Timeline month"
              value={date.getUTCMonth()}
              onChange={(e) =>
                setHour(
                  (Date.UTC(2001, Number(e.target.value), 1) - Date.UTC(2001, 0, 1)) / 3600000 +
                    (hour % 24),
                )
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {new Date(2001, i, 1).toLocaleDateString('en-GB', { month: 'short' })}
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
                  setHour((value - Date.UTC(2001, 0, 1)) / 3600000 + (hour % 24));
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
              onChange={(e) => setHour(Math.floor(hour / 24) * 24 + Number(e.target.value))}
            />
          </label>
        </div>
      </div>
      <div className="timeline-bottom">
        <button
          className="icon-button"
          aria-label="Previous hour"
          onClick={() => setHour(hour - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? 'Pause playback' : 'Play playback'}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-button" aria-label="Next hour" onClick={() => setHour(hour + 1)}>
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
          onChange={(e) => setHour(Number(e.target.value))}
        />
        <span className="timeline-time">
          {day.slice(8)} {date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })} ·{' '}
          {String(hour % 24).padStart(2, '0')}:00{' '}
          <small>UTC+{columns?.timestamp_local?.[hour]?.toString().slice(-5) || '03:30'}</small>
        </span>
      </div>
    </div>
  );
}
