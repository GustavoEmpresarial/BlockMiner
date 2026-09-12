import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Zap } from 'lucide-react';
import {
  Card,
  safeDashboardNumber,
  parseBlockTime,
  formatDashboardBlockTime,
} from './dashboard.shared';

afterEach(() => cleanup());

describe('safeDashboardNumber', () => {
  it('returns an em dash for genuinely non-numeric input instead of "NaN"', () => {
    expect(safeDashboardNumber('not-a-number')).toBe('—');
    expect(safeDashboardNumber(undefined)).toBe('—');
  });

  it('coerces null to 0 (Number(null) === 0) rather than showing an em dash', () => {
    expect(safeDashboardNumber(null)).toBe('0');
  });

  it('formats with the requested decimal count', () => {
    expect(safeDashboardNumber(1.23456, 2)).toBe('1.23');
  });
});

describe('parseBlockTime', () => {
  it('returns null for null/invalid input instead of an Invalid Date', () => {
    expect(parseBlockTime(null)).toBeNull();
    expect(parseBlockTime('not-a-date')).toBeNull();
  });

  it('parses a valid date string', () => {
    expect(parseBlockTime('2026-01-01T00:00:00Z')?.getUTCFullYear()).toBe(2026);
  });
});

describe('formatDashboardBlockTime', () => {
  it('returns an em dash when no timestamp field is present', () => {
    expect(formatDashboardBlockTime({})).toBe('—');
  });

  it('treats a small numeric timestamp as seconds, not ms', () => {
    // 1_600_000_000 < 1e12 -> treated as seconds
    expect(formatDashboardBlockTime({ timestamp: 1_600_000_000 })).not.toBe('—');
  });

  it('falls back to em dash for a value that cannot be parsed as a date at all', () => {
    expect(formatDashboardBlockTime({ timestamp: {} as unknown as string })).toBe('—');
  });
});

describe('Card', () => {
  it('renders the label/value/unit for a normal stat card', () => {
    render(<Card icon={Zap} label="Speed" value="42" unit="H/s" color="amber" />);
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('H/s')).toBeInTheDocument();
  });

  it('renders the plain children wrapper when label is omitted (hooks must still run in the same order both times)', () => {
    render(
      <Card unit="" value="" color="blue" label={undefined as unknown as string}>
        <p>custom content</p>
      </Card>,
    );
    expect(screen.getByText('custom content')).toBeInTheDocument();
  });

  it('falls back to the icon when no logo is provided', () => {
    const { container } = render(<Card icon={Zap} label="Speed" value="1" unit="x" color="amber" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to the icon once the logo image errors out', () => {
    const { container } = render(
      <Card icon={Zap} logoUrl="/broken.webp" label="Balance" value="1" unit="POL" color="blue" />,
    );
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    fireEvent.error(img!);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
