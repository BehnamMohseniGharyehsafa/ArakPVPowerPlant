import { useEffect, useId, useState } from 'react';
import { arakTmyTime } from '../services/siteTime';
import { useTwin } from '../state/store';

/** A real site clock, visible even when the simulation is in manual mode. */
export function ArakClock() {
  const [now, setNow] = useState(() => new Date());
  const timeMode = useTwin((state) => state.timeMode);
  const weather = useTwin((state) => state.run?.metadata.scenario.weather_id);
  const supportsArakClock = !weather || weather === 'arak';
  const clockId = useId();
  const clock = arakTmyTime(now);
  const [hour, minute, second] = clock.localTime.split(':').map(Number);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return (
    <button
      className={'arak-clock ' + (timeMode === 'arak' ? 'active' : '')}
      aria-label="Use Arak local time"
      aria-describedby={clockId}
      aria-pressed={timeMode === 'arak'}
      disabled={!supportsArakClock}
      title={
        supportsArakClock
          ? `${clock.localDate} · ${clock.localTime} · Asia/Tehran. Click to ${timeMode === 'arak' ? 'stop following' : 'simulate at'} Arak's current TMY hour.`
          : 'Current Arak time. Following site time requires the Arak reference weather.'
      }
      onClick={() => {
        if (timeMode === 'arak') useTwin.setState({ timeMode: 'manual' });
        else useTwin.getState().followArakTime(new Date());
      }}
    >
      <svg className="arak-clock-face" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={`${clockId}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#e6d3a0" />
            <stop offset="0.45" stopColor="#a88a4e" />
            <stop offset="1" stopColor="#f0e1bb" />
          </linearGradient>
          <radialGradient id={`${clockId}-dial`} cx="0.4" cy="0.3" r="0.8">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#f3eedf" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={`url(#${clockId}-rim)`} />
        <circle cx="50" cy="50" r="44.5" fill={`url(#${clockId}-dial)`} stroke="#fffaf0" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="#dfd8c6" strokeWidth="0.5" />
        {Array.from({ length: 60 }, (_, tick) => (
          <line
            key={tick}
            x1="50"
            y1={tick % 5 === 0 ? 11 : 9}
            x2="50"
            y2={tick % 5 === 0 ? 16 : 11}
            transform={`rotate(${tick * 6} 50 50)`}
            stroke={tick % 5 === 0 ? '#365f61' : '#b5b4a7'}
            strokeWidth={tick % 5 === 0 ? 1.5 : 0.65}
            strokeLinecap="round"
          />
        ))}
        <g className="arak-clock-numerals" textAnchor="middle" fill="#35595c">
          <text x="50" y="26">
            12
          </text>
          <text x="77" y="53">
            3
          </text>
          <text x="50" y="80">
            6
          </text>
          <text x="23" y="53">
            9
          </text>
        </g>
        <text x="50" y="67" textAnchor="middle" className="arak-clock-dial-label">
          ARAK
        </text>
        <g strokeLinecap="round">
          <line
            className="clock-hour-hand"
            x1="50"
            y1="54"
            x2="50"
            y2="29"
            stroke="#174f53"
            strokeWidth="4"
            transform={`rotate(${(hour % 12) * 30 + minute / 2 + second / 120} 50 50)`}
          />
          <line
            className="clock-minute-hand"
            x1="50"
            y1="56"
            x2="50"
            y2="19"
            stroke="#174f53"
            strokeWidth="2.6"
            transform={`rotate(${minute * 6 + second / 10} 50 50)`}
          />
          <g className="clock-second-hand" transform={`rotate(${second * 6} 50 50)`}>
            <line x1="50" y1="59" x2="50" y2="15" stroke="#c27c43" strokeWidth="1.15" />
            <circle cx="50" cy="60" r="2.3" fill="#c27c43" />
          </g>
        </g>
        <circle cx="50" cy="50" r="3.3" fill="#c3a063" stroke="#fff6df" strokeWidth="1" />
      </svg>
      <span className="arak-clock-copy">
        <span className="arak-clock-location">
          ARAK <span>·</span> IRAN
        </span>
        <time
          id={clockId}
          dateTime={now.toISOString()}
          aria-label={`${clock.localDate} · ${clock.localTime} · Asia/Tehran`}
        >
          {clock.localTime}
        </time>
        <span className="arak-clock-mode">
          <span className="arak-clock-indicator" />
          {timeMode === 'arak' ? 'Following site time' : 'Use site time'}
        </span>
      </span>
    </button>
  );
}
