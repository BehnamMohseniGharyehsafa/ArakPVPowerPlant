import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Timeline } from './Timeline';
import { ArakClock } from './ArakClock';
import { useTwin } from '../state/store';

const initialState = useTwin.getState();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-31T20:29:58Z'));
  useTwin.setState(
    { ...initialState, loadEquipment: vi.fn().mockResolvedValue(undefined), simulate: vi.fn() },
    true,
  );
});
afterEach(() => {
  cleanup();
  useTwin.setState(initialState, true);
  vi.useRealTimers();
});

describe('Arak clock control', () => {
  it('follows the local hour boundary without rerunning annual physics or fetching every second', () => {
    render(
      <>
        <ArakClock />
        <Timeline />
      </>,
    );
    const clock = screen.getByRole('button', { name: 'Use Arak local time' });
    fireEvent.click(clock);
    expect(clock).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Timeline date')).toHaveValue('2001-12-31');
    expect(useTwin.getState().loadEquipment).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(useTwin.getState().hour).toBe(8759);
    expect(useTwin.getState().loadEquipment).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText('Timeline date')).toHaveValue('2001-01-01');
    expect(useTwin.getState().hour).toBe(0);
    expect(useTwin.getState().loadEquipment).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next hour' }));
    act(() => vi.advanceTimersByTime(60000));
    expect(clock).toHaveAttribute('aria-pressed', 'false');
    expect(useTwin.getState().hour).toBe(1);
    expect(useTwin.getState().simulate).not.toHaveBeenCalled();
  });
  it('switches between accelerated playback and the current site hour', () => {
    render(
      <>
        <ArakClock />
        <Timeline />
      </>,
    );
    const clock = screen.getByRole('button', { name: 'Use Arak local time' });
    fireEvent.click(clock);
    fireEvent.click(screen.getByRole('button', { name: 'Play playback' }));
    act(() => vi.advanceTimersByTime(800));
    expect(useTwin.getState().hour).toBe(0);
    expect(clock).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(clock);
    expect(useTwin.getState().hour).toBe(8759);
    expect(screen.getByRole('button', { name: 'Play playback' })).toBeVisible();
    fireEvent.click(clock);
    expect(useTwin.getState().timeMode).toBe('manual');
    expect(useTwin.getState().simulate).not.toHaveBeenCalled();
  });
  it('catches up immediately when a background tab is focused again', () => {
    render(
      <>
        <ArakClock />
        <Timeline />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use Arak local time' }));
    vi.setSystemTime(new Date('2027-01-01T01:00:00Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(useTwin.getState().hour).toBe(4);
    expect(useTwin.getState().simulate).not.toHaveBeenCalled();
  });
  it('shows a ticking analog clock in manual mode without changing the simulation', () => {
    vi.setSystemTime(new Date('2026-11-01T06:45:30Z'));
    const { container } = render(<ArakClock />);
    expect(screen.getByText('10:15:30')).toBeVisible();
    expect(container.querySelector('.clock-hour-hand')).toHaveAttribute(
      'transform',
      'rotate(307.75 50 50)',
    );
    expect(container.querySelector('.clock-minute-hand')).toHaveAttribute(
      'transform',
      'rotate(93 50 50)',
    );
    expect(container.querySelector('.clock-second-hand')).toHaveAttribute(
      'transform',
      'rotate(180 50 50)',
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('10:15:31')).toBeVisible();
    expect(container.querySelector('.clock-second-hand')).toHaveAttribute(
      'transform',
      'rotate(186 50 50)',
    );
    expect(useTwin.getState().timeMode).toBe('manual');
    expect(useTwin.getState().loadEquipment).not.toHaveBeenCalled();
    expect(useTwin.getState().simulate).not.toHaveBeenCalled();
  });
});
