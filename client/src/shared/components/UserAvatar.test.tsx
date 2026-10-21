/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import UserAvatar, { avatarInitial, isSafeAvatarUrl } from './UserAvatar';

afterEach(cleanup);
const GOOD = `/media/avatars/${'c'.repeat(32)}.webp`;

describe('UserAvatar', () => {
  it('shows the photo for a server-issued avatar path', () => {
    render(<UserAvatar url={GOOD} name="ana" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', GOOD);
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to the initial without a URL, and when the image fails to load', () => {
    const { rerender } = render(<UserAvatar url={null} name="bob" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('B')).toBeInTheDocument();
    rerender(<UserAvatar url={GOOD} name="bob" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('never renders an arbitrary URL from a payload', () => {
    for (const bad of ['https://evil.example/x.png', 'javascript:alert(1)', '/media/avatars/../../x.webp', '/media/miners/a.webp', `${GOOD}?x=1`]) {
      expect(isSafeAvatarUrl(bad)).toBe(false);
      cleanup();
      render(<UserAvatar url={bad} name="eve" />);
      expect(screen.queryByRole('img')).toBeNull();
    }
  });

  it('initial helper', () => {
    expect(avatarInitial('  zoe')).toBe('Z');
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial(null)).toBe('?');
  });
});
