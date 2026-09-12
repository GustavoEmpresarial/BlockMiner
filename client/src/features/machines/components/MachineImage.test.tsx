import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MachineImage } from './MachineImage';

afterEach(cleanup);

describe('MachineImage', () => {
  it('renders an <img> for a valid image URL', () => {
    render(<MachineImage imageUrl="/media/miners/x.webp" name="Quantum Miner" />);
    const img = screen.getByRole('img', { name: 'Quantum Miner' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/media/miners/x.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders the placeholder when imageUrl is null', () => {
    render(<MachineImage imageUrl={null} name="No Image Miner" />);
    expect(screen.getByRole('img', { name: 'No Image Miner' })).toHaveTextContent('GPU');
  });

  it('renders the placeholder for a blocked/unsafe URL (e.g. javascript:)', () => {
    render(<MachineImage imageUrl="javascript:alert(1)" name="Evil" />);
    expect(screen.getByRole('img', { name: 'Evil' })).toHaveTextContent('GPU');
  });

  it('falls back to the placeholder after the <img> fails to load', () => {
    render(<MachineImage imageUrl="/media/miners/broken.webp" name="Broken" />);
    const img = screen.getByRole('img', { name: 'Broken' });
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Broken' })).toHaveTextContent('GPU');
  });

  it('placeholder falls back to "Miner" for an empty/unsafe name', () => {
    render(<MachineImage imageUrl={null} name="" />);
    expect(screen.getByRole('img', { name: 'Miner' })).toBeInTheDocument();
  });

  it('applies wrapperClassName to the placeholder when provided', () => {
    render(<MachineImage imageUrl={null} name="X" wrapperClassName="my-wrapper" className="ignored" />);
    expect(screen.getByRole('img', { name: 'X' })).toHaveClass('my-wrapper');
  });
});
