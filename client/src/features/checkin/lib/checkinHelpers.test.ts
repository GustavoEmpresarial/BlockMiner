import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CheckinMilestone } from './checkin.types';
import {
  milestoneDescription,
  milestoneRewardLine,
  milestoneTitle,
} from './checkinHelpers';

const localesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../i18n/locales',
);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(localesDir, name), 'utf8')) as Record<string, unknown>;
}

describe('checkinHelpers — milestone i18n interpolation resilience', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'pt-BR',
      fallbackLng: 'en',
      resources: {
        'pt-BR': { translation: load('pt-BR.json') },
        en: { translation: load('en.json') },
        es: { translation: load('es.json') },
      },
      interpolation: {
        escapeValue: false,
      },
    });
  });

  const t = ((key: string, opts?: Record<string, unknown>) => String(i18next.t(key, opts as never))) as unknown as Parameters<typeof milestoneTitle>[0];

  it('renders a POL milestone WITHOUT rewardValue and WITHOUT amount without leaking raw placeholders', () => {
    for (const lng of ['pt-BR', 'en', 'es']) {
      i18next.changeLanguage(lng);

      const milestoneWithoutAmount: CheckinMilestone = {
        id: 14,
        dayThreshold: 14,
        rewardType: 'pol',
        rewardValue: undefined as unknown as number,
        amount: undefined as unknown as number,
      };

      const title = milestoneTitle(t, milestoneWithoutAmount);
      const desc = milestoneDescription(t, milestoneWithoutAmount);
      const line = milestoneRewardLine(t, milestoneWithoutAmount);

      expect(title).not.toContain('{{');
      expect(title).not.toContain('}}');
      expect(desc).not.toContain('{{');
      expect(desc).not.toContain('}}');
      expect(line).not.toContain('{{');
      expect(line).not.toContain('}}');

      // In pt-BR, it should safely fall back to '— POL — dia 14'
      if (lng === 'pt-BR') {
        expect(title).toBe('— POL — dia 14');
      }
    }
  });

  it('renders a POL milestone with amount 0 without leaking raw placeholders', () => {
    i18next.changeLanguage('pt-BR');

    const milestoneZeroAmount: CheckinMilestone = {
      id: 14,
      dayThreshold: 14,
      rewardType: 'pol',
      rewardValue: 0,
      amount: 0,
    };

    const title = milestoneTitle(t, milestoneZeroAmount);
    expect(title).not.toContain('{{');
    expect(title).not.toContain('}}');
    expect(title).toBe('— POL — dia 14');
  });

  it('renders a temporary_power milestone without power or duration without leaking raw placeholders', () => {
    for (const lng of ['pt-BR', 'en', 'es']) {
      i18next.changeLanguage(lng);

      const milestoneNoPower: CheckinMilestone = {
        id: 7,
        dayThreshold: 7,
        rewardType: 'temporary_power',
        rewardValue: undefined as unknown as number,
        amount: undefined as unknown as number,
        powerAmount: undefined as unknown as number,
        durationHours: undefined,
      };

      const title = milestoneTitle(t, milestoneNoPower);
      const desc = milestoneDescription(t, milestoneNoPower);
      const line = milestoneRewardLine(t, milestoneNoPower);

      expect(title).not.toContain('{{');
      expect(title).not.toContain('}}');
      expect(desc).not.toContain('{{');
      expect(desc).not.toContain('}}');
      expect(line).not.toContain('{{');
      expect(line).not.toContain('}}');
    }
  });

  it('renders a machine milestone without name or power without leaking raw placeholders', () => {
    for (const lng of ['pt-BR', 'en', 'es']) {
      i18next.changeLanguage(lng);

      const milestoneNoMachineInfo: CheckinMilestone = {
        id: 30,
        dayThreshold: 30,
        rewardType: 'machine',
        minerName: undefined as unknown as string,
        powerAmount: undefined as unknown as number,
        minerBaseHashRate: undefined as unknown as number,
      };

      const title = milestoneTitle(t, milestoneNoMachineInfo);
      const desc = milestoneDescription(t, milestoneNoMachineInfo);
      const line = milestoneRewardLine(t, milestoneNoMachineInfo);

      expect(title).not.toContain('{{');
      expect(title).not.toContain('}}');
      expect(desc).not.toContain('{{');
      expect(desc).not.toContain('}}');
      expect(line).not.toContain('{{');
      expect(line).not.toContain('}}');
    }
  });

  it('renders proper values when amount is provided', () => {
    i18next.changeLanguage('pt-BR');

    const validMilestone: CheckinMilestone = {
      id: 14,
      dayThreshold: 14,
      rewardType: 'pol',
      rewardValue: 0.1,
      amount: 0.1,
    };

    const title = milestoneTitle(t, validMilestone);
    expect(title).toBe('0.1 POL — dia 14');
  });
});
