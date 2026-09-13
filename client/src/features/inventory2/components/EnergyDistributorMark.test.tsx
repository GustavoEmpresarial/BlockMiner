import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EnergyDistributorMark } from './EnergyDistributorMark';

describe('EnergyDistributorMark', () => {
  it('renders with default props (lit, default size)', () => {
    const { container } = render(<EnergyDistributorMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('h-16', 'w-16');
    expect(svg?.querySelector('path')).toHaveAttribute('stroke', '#fb923c');
  });

  it('renders the unlit palette when lit=false', () => {
    const { container } = render(<EnergyDistributorMark lit={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.querySelector('path')).toHaveAttribute('stroke', '#64748b');
  });

  it('applies a custom className', () => {
    const { container } = render(<EnergyDistributorMark className="h-8 w-8 custom" />);
    expect(container.querySelector('svg')).toHaveClass('h-8', 'w-8', 'custom');
  });
});
