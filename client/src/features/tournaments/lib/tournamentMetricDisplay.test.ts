import { beforeAll, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { tournamentDisplayDescription, tournamentDisplayName } from './tournamentMetricDisplay';

beforeAll(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

const yt = {
  name: 'Daily YouTube Tournament',
  description: 'Daily ranking by YouTube videos watched (claims). Pontuação livre sem travar no teto de hashrate.',
  metric: 'YOUTUBE',
  type: 'DAILY',
};

describe('tournament display name', () => {
  it('shows recurring series in the player language, not the English admin name', () => {
    expect(tournamentDisplayName(yt)).toBe('Torneio de YouTube · Diário');
    expect(tournamentDisplayDescription(yt)).toMatch(/^Ranking por vídeos assistidos no YouTube/);
    expect(tournamentDisplayName({ ...yt, metric: 'OFFERS_ALL', type: 'WEEKLY' })).toBe('Torneio de Offerwall · Semanal');
  });

  it('keeps the admin-typed name for custom tournaments', () => {
    const custom = { name: 'Copa de Natal', description: 'Evento especial', metric: 'YOUTUBE', type: 'CUSTOM' };
    expect(tournamentDisplayName(custom)).toBe('Copa de Natal');
    expect(tournamentDisplayDescription(custom)).toBe('Evento especial');
  });

  it('says YouTube claims have no cap in the General tournament', () => {
    expect(ptBR.tournaments.activity_youtube_points).toBe('+1 pt / claim (sem teto)');
    expect(ptBR.tournaments.youtube_scoring_hint).not.toMatch(/não entram/);
  });
});
