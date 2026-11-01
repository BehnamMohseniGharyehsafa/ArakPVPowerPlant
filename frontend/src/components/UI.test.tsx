import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NumberInput } from './UI';
import { Timeline } from './Timeline';
import { useTwin } from '../state/store';
import { topology } from '../solar-field/geometry';
afterEach(cleanup);
describe('engineering controls', () => {
  it('passes edited numeric assumptions to the configuration owner', () => {
    const update = vi.fn();
    render(<NumberInput label="Tilt" unit="degrees" value={30} onChange={update} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '37' } });
    expect(update).toHaveBeenCalledWith(37);
  });
  it('uses the selected hour for time navigation without running annual physics', () => {
    const setHour = vi.fn();
    useTwin.setState({ hour: 4116, setHour, columns: null });
    render(<Timeline />);
    expect(screen.getByLabelText('Timeline date')).toHaveValue('2001-06-21');
    fireEvent.click(screen.getByRole('button', { name: 'Next hour' }));
    expect(setHour).toHaveBeenCalledWith(4117);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Timeline hour' }), {
      target: { value: '8' },
    });
    expect(setHour).toHaveBeenCalledWith(4112);
  });
  it('generates the full electrical topology and correct pitch in the rendered geometry', () => {
    const p = {
      module: { width_m: 1.303, length_m: 2.384 },
      modules_per_string: 26,
      strings_per_inverter: 8,
      inverter_count: 20,
      tilt_deg: 30,
      azimuth_deg: 180,
      row_pitch_m: 6.3,
      clearance_m: 0.8,
    };
    const field = topology(p);
    expect(field.positions).toHaveLength(4160);
    expect(field.inverters).toHaveLength(20);
    expect(field.positions[26].z - field.positions[0].z).toBeCloseTo(6.3);
    expect(field.positions[208].inv).toBe(1);
    expect(field.positions[4159].string).toBe(159);
  });
});
