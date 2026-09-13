import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Zap } from 'lucide-react';
import StatCard from './StatCard';

afterEach(() => cleanup());

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Hashrate" value="42 H/s" />);
    expect(screen.getByText('Hashrate')).toBeInTheDocument();
    expect(screen.getByText('42 H/s')).toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    const { container } = render(<StatCard label="Hashrate" value="1" icon={Zap} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('omits the icon element entirely when none is provided', () => {
    const { container } = render(<StatCard label="Hashrate" value="1" />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders the optional sub content only when provided', () => {
    const { rerender, container } = render(<StatCard label="L" value="1" sub="extra info" />);
    expect(screen.getByText('extra info')).toBeInTheDocument();
    rerender(<StatCard label="L" value="1" />);
    expect(container.querySelectorAll('.mt-2').length).toBe(0);
  });

  it('applies default accent/border classes when not overridden', () => {
    const { container } = render(<StatCard label="L" value="1" />);
    expect(container.firstChild).toHaveClass('border-slate-800');
  });

  it('applies custom accent/border/className overrides', () => {
    const { container } = render(
      <StatCard label="L" value="1" accent="text-red-500" border="border-red-500" className="extra-class" />,
    );
    expect(container.firstChild).toHaveClass('border-red-500', 'extra-class');
  });
});
