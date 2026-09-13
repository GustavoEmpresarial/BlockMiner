import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CoolingFanUnit } from './CoolingFanUnit';

describe('CoolingFanUnit', () => {
  it('renders 3 fan rotors, not spinning by default', () => {
    const { container } = render(<CoolingFanUnit />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-auto', 'w-full');
    expect(container.querySelectorAll('.rack-fan-spin')).toHaveLength(0);
  });

  it('applies the spin class + animation delay to each rotor when spinning', () => {
    const { container } = render(<CoolingFanUnit spinning />);
    const spinning = container.querySelectorAll('.rack-fan-spin');
    expect(spinning).toHaveLength(3);
    expect((spinning[1] as HTMLElement).style.animationDelay).toBe('0.12s');
  });

  it('applies a custom className to the svg', () => {
    const { container } = render(<CoolingFanUnit className="custom-class" />);
    expect(container.querySelector('svg')).toHaveClass('custom-class');
  });

  it('generates unique gradient ids per instance (no id collisions when rendered twice)', () => {
    const { container } = render(
      <>
        <CoolingFanUnit />
        <CoolingFanUnit />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
