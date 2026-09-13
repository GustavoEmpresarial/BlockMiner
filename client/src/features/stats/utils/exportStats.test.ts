import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { exportPowerStatsCsv, exportEarningsStatsCsv, exportEarningsCsv } from './exportStats';
import type { UserPowerStatsPayload } from '../lib/stats.api';
import type { UserEarningsPayload } from '../lib/stats.earnings.api';

let capturedBlob: Blob | null = null;
let clickSpy: ReturnType<typeof vi.fn>;
let capturedDownloadName = '';

beforeEach(() => {
  capturedBlob = null;
  capturedDownloadName = '';
  clickSpy = vi.fn();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob;
    return 'blob:mock-url';
  });
  URL.revokeObjectURL = vi.fn();
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'download', {
        get: () => capturedDownloadName,
        set: (v: string) => {
          capturedDownloadName = v;
        },
      });
      el.click = clickSpy;
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function readBlobText(blob: Blob | null): Promise<string> {
  if (!blob) throw new Error('no blob captured');
  return blob.text();
}

function basePower(overrides: Partial<UserPowerStatsPayload> = {}): UserPowerStatsPayload {
  return {
    overview: { totalHashrate: 100, permanentHashrate: 60, temporaryHashrate: 40 },
    machines: { items: [] },
    ...overrides,
  } as unknown as UserPowerStatsPayload;
}

function baseEarnings(overrides: Partial<UserEarningsPayload> = {}): UserEarningsPayload {
  return {
    total: 100,
    mining: 40,
    offerwall: 30,
    offerwallInternal: 15,
    offerwallExternal: 15,
    faucet: 10,
    shortlinks: 5,
    youtube: 5,
    games: 5,
    autoMining: 3,
    checkin: 1,
    referrals: 1,
    referralStatsSince: '2026-01-01',
    period: '30d',
    history: [],
    powerMeta: { machineCount: 0, activeBoosts: 0, powerGained24h: 0 },
    ...overrides,
  } as unknown as UserEarningsPayload;
}

describe('exportPowerStatsCsv', () => {
  it('triggers a download with the .csv extension and clicks the anchor', async () => {
    exportPowerStatsCsv(basePower(), 'my-power-stats');
    expect(capturedDownloadName).toBe('my-power-stats.csv');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('includes overview fields in the CSV body', async () => {
    exportPowerStatsCsv(basePower(), 'p');
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('totalHashrate');
    expect(text).toContain('100');
  });

  it('includes one row per machine, with name/hashrate/active status', async () => {
    exportPowerStatsCsv(
      basePower({ machines: { items: [{ minerName: 'Rig A', hashRate: 50, isActive: true }] } } as never),
      'p',
    );
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('Rig A');
    expect(text).toContain('active=true');
  });

  it('does not throw when overview and machines are entirely missing', async () => {
    expect(() => exportPowerStatsCsv({} as UserPowerStatsPayload, 'p')).not.toThrow();
  });

  it('quotes and escapes embedded double-quotes/commas in CSV cells', async () => {
    exportPowerStatsCsv(
      basePower({ machines: { items: [{ minerName: 'Rig "Prime", #1', hashRate: 1, isActive: false }] } } as never),
      'p',
    );
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('""Prime""');
  });
});

describe('exportEarningsStatsCsv / exportEarningsCsv alias', () => {
  it('triggers a download named "<basename>-earnings.csv"', () => {
    exportEarningsStatsCsv(baseEarnings(), 'my-earnings');
    expect(capturedDownloadName).toBe('my-earnings-earnings.csv');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('formats generatedAtUtc/fromUtc/toUtc as UTC datetime strings, and blanks them when absent', async () => {
    exportEarningsStatsCsv(baseEarnings({ generatedAtUtc: '2026-03-05T10:30:00Z' } as never), 'e');
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('2026-03-05 10:30:00 UTC');
    expect(text).toContain('"fromUtc","",""'); // fromUtc absent -> empty string cell
  });

  it('computes each category percentage of the total, rounded to one decimal', async () => {
    exportEarningsStatsCsv(baseEarnings({ total: 100, mining: 33 } as never), 'e');
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('"mining","33","33"'); // 33/100 -> 33.0 -> "33"
  });

  it('falls back to a divisor of 1 when total is 0, instead of dividing by zero', async () => {
    expect(() => exportEarningsStatsCsv(baseEarnings({ total: 0, mining: 0 } as never), 'e')).not.toThrow();
  });

  it('includes one row per history day', async () => {
    exportEarningsStatsCsv(
      baseEarnings({ history: [{ date: '2026-03-01', total: 5 }] } as never),
      'e',
    );
    const text = await readBlobText(capturedBlob);
    expect(text).toContain('2026-03-01 00:00:00 UTC');
  });

  it('exportEarningsCsv is the same function as exportEarningsStatsCsv', () => {
    expect(exportEarningsCsv).toBe(exportEarningsStatsCsv);
  });
});
