import { describe, it, expect } from 'vitest';
import {
  evaluateAlert,
  formatDetailText,
  formatListRow,
  truncateUtf8,
  utf8Length,
  type MarketItem,
} from './formatters';
import { parsePolymarketMarkets } from './feeds';

describe('EvenPulse G2 formatters', () => {
  it('enforces EvenHub 63-byte list limit and 999-byte text limit', () => {
    const longText = 'Will the Federal Reserve announce an emergency rate cut before December 2026 FOMC?';
    const truncated = truncateUtf8(longText, 60);
    expect(utf8Length(truncated)).toBeLessThanOrEqual(63);
    expect(truncated.endsWith('...')).toBe(true);

    const item: MarketItem = {
      id: '1',
      feed: 'polymarket',
      symbol: 'POLY',
      title: longText,
      primaryMetric: 67.4,
      secondaryText: 'Liq $240K',
      volumeText: 'Vol24h $1.5M',
      source: 'Polymarket Gamma API',
    };

    const row = formatListRow(item, true);
    expect(utf8Length(row)).toBeLessThanOrEqual(63);
    expect(row.startsWith('!YES')).toBe(true);

    const detail = formatDetailText(item, 65, true);
    expect(utf8Length(detail)).toBeLessThanOrEqual(999);
    expect(detail).toContain('ALERT: TRIGGERED');
  });

  it('parses Polymarket Gamma payload and evaluates alert thresholds', () => {
    const parsed = parsePolymarketMarkets([
      {
        id: '42',
        question: 'Solana above $100 in Dec?',
        outcomePrices: '["0.72","0.28"]',
        volume24hr: 1250000,
        liquidity: 310000,
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].primaryMetric).toBeCloseTo(72, 1);
    expect(evaluateAlert(parsed[0], 70)).toBe(true);
    expect(evaluateAlert(parsed[0], 80)).toBe(false);
  });
});
