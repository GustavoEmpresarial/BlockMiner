import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import pt from '../../../i18n/locales/pt-BR.json';
import { formatRewardSummary, taskDescription } from './dailyTasksHelpers';
import type { DailyTaskRow, DailyTasksTranslate } from './dailyTasksTypes';

const t = i18n.t.bind(i18n) as DailyTasksTranslate;

function task(translationKey: string, targetValue: number | string): DailyTaskRow {
  return { id: 1, translationKey, targetValue, status: 'available' };
}

describe('daily task Portuguese copy', () => {
  it('agrees singular and plural instead of parenthetical suffixes', async () => {
    await i18n.init({
      lng: 'pt-BR',
      resources: { 'pt-BR': { translation: pt } },
      interpolation: { escapeValue: false },
    });

    expect(taskDescription(t, task('dailyTasks.tasks.checkin', 1))).toBe('Faça 1 check-in neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.checkin', 5))).toBe('Faça 5 check-ins neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.faucet', 1))).toBe('Colete o Faucet 1 vez neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.watch_youtube', 3))).toBe('Resgate 3 recompensas do YouTube neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.play_games', 2))).toBe('Vença 2 minijogos neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.shortlinks', 2))).toBe('Complete 2 shortlinks neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.offers', 3))).toBe('Complete 3 ofertas no Offerwall neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.auto_mining', 10))).toBe('Resgate 10 recompensas do Auto Mining neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.merge', 1))).toBe('Faça 1 fusão no Merge neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.merge', 5))).toBe('Faça 5 fusões no Merge neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.burn', 1))).toBe('Resgate 1 queima neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.referrals', 1))).toBe('Tenha 1 indicação qualificada neste período');
    expect(taskDescription(t, task('dailyTasks.tasks.mine_blk', '0.02'))).toBe('Ganhe 0.02 BLK minerando neste período');
    expect(formatRewardSummary(t, { kind: 'HASHRATE_TEMP', hashRate: 100, days: 1 })).toBe('+100 H/s por 1 dia');
    expect(formatRewardSummary(t, { kind: 'HASHRATE_TEMP', hashRate: 400, days: 3 })).toBe('+400 H/s por 3 dias');
  });
});
