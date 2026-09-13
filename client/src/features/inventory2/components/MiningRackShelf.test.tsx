import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MiningRackShelf } from './MiningRackShelf';

afterEach(cleanup);

describe('MiningRackShelf', () => {
  it('renders an accessible SVG image with the default class', () => {
    render(<MiningRackShelf />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Mining rack');
    expect(svg).toHaveClass('h-auto', 'w-full');
  });

  it('applies a custom className', () => {
    render(<MiningRackShelf className="custom" />);
    expect(document.querySelector('svg')).toHaveClass('custom');
  });

  it('generates unique gradient ids per instance', () => {
    const { container } = render(
      <>
        <MiningRackShelf />
        <MiningRackShelf />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
