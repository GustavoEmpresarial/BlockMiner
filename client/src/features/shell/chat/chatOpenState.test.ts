import { describe, expect, it } from 'vitest';
import { useGameStore } from '../lib/game.store';

describe('chat open state', () => {
  it('clears hasMention in openChat and toggleChat', () => {
    useGameStore.setState({ hasMention: true, isChatOpen: false });
    useGameStore.getState().openChat();
    expect(useGameStore.getState().isChatOpen).toBe(true);
    expect(useGameStore.getState().hasMention).toBe(false);

    useGameStore.setState({ hasMention: true, isChatOpen: false });
    useGameStore.getState().toggleChat();
    expect(useGameStore.getState().isChatOpen).toBe(true);
    expect(useGameStore.getState().hasMention).toBe(false);
  });
});
