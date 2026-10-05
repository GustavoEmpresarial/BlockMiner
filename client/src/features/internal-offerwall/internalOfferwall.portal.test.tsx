import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OfferCard } from './internalOfferwall.parts';
import type {
  InternalOfferwallAttempt,
  InternalOfferwallOffer,
  InternalOfferwallUsage,
  IoTranslate,
} from './lib/internalOfferwallTypes';

describe('Internal Offerwall — Portal Anchor Proof', () => {
  it('renders exit confirmation modal via createPortal directly into document.body when exitConfirmOpen is true', () => {
    const fakeOffer: InternalOfferwallOffer = {
      id: 1,
      title: 'Test Offer',
      kind: 'GENERAL',
      completionMode: 'SELF',
      rewardPolAmount: '0.5',
    };

    const fakeAttempt: InternalOfferwallAttempt = {
      id: 10,
      offerId: 1,
      status: 'STARTED',
      startedAt: new Date().toISOString(),
    };

    const fakeUsage: InternalOfferwallUsage = {
      completedCount: 0,
      maxPerPeriod: 5,
      secondsUntilAvailable: null,
      canStartNew: true,
    };

    const t = ((k: string) => k) as unknown as IoTranslate;

    const { container } = render(
      <OfferCard
        domId="offer-1"
        offer={fakeOffer}
        attempt={fakeAttempt}
        t={t}
        rewardLabel="0.5 POL"
        startBusy={false}
        submitBusy={false}
        partnerBusy={false}
        abandonBusy={false}
        isPtc={false}
        modeSelf={true}
        usage={fakeUsage}
        limitBlocksStart={false}
        countdownRemain={null}
        minSec={10}
        isPaused={false}
        canSubmit={false}
        remaining={10}
        exitConfirmOpen={true}
        onStart={() => {}}
        onSubmit={() => {}}
        onPartnerOpen={undefined}
        onOpenExitConfirm={() => {}}
        onCloseExitConfirm={() => {}}
        onConfirmLeaveTask={() => {}}
        onBackToList={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // PROOF: The dialog portal overlay is attached directly to document.body, NOT trapped inside the card container!
    const portalOverlay = dialog.parentElement;
    expect(portalOverlay?.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
  });
});
