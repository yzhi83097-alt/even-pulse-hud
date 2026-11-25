export type FeedMode = 'polymarket' | 'crypto';

export interface MarketItem {
  id: string;
  feed: FeedMode;
  symbol: string;
  title: string;
  primaryMetric: number; // Polymarket YES % (0-100) or USD price
  secondaryText: string;
  volumeText: string;
  source: string;
  alertThreshold?: number;
}

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Truncates text so its UTF-8 byte length never exceeds maxBytes.
 * Required by EvenHub firmware & simulator (63 bytes for list items, 999 for text containers).
 */
export function truncateUtf8(text: string, maxBytes: number): string {
  const clean = text.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (utf8Length(clean) <= maxBytes) return clean;
  let out = '';
  for (const ch of clean) {
    const candidate = `${out}${ch}...`;
    if (utf8Length(candidate) > maxBytes) break;
    out += ch;
  }
  return out ? `${out}...` : clean.slice(0, Math.max(0, maxBytes));
}

export function formatListRow(item: MarketItem, isArmed: boolean): string {
  const flag = isArmed ? '!' : '';
  if (item.feed === 'polymarket') {
    const pct = `${Math.round(item.primaryMetric)}%`;
    return truncateUtf8(`${flag}YES ${pct.padStart(3)} | ${item.title}`, 52);
  }
  const priceStr =
    item.primaryMetric >= 1000
      ? `$${Math.round(item.primaryMetric).toLocaleString('en-US')}`
      : item.primaryMetric >= 1
      ? `$${item.primaryMetric.toFixed(2)}`
      : `$${item.primaryMetric.toFixed(4)}`;
  return truncateUtf8(`${flag}${item.symbol} ${priceStr} ${item.secondaryText}`, 52);
}

export function formatDetailText(item: MarketItem, threshold: number | undefined, isTriggered: boolean): string {
  const alertLine = isTriggered
    ? `ALERT: TRIGGERED (target >= ${threshold}%)`
    : threshold !== undefined
    ? `Alert: Armed at >= ${threshold}${item.feed === 'polymarket' ? '%' : ' USD'}`
    : 'Alert: Off (Click to arm)';

  if (item.feed === 'polymarket') {
    const yesPct = item.primaryMetric.toFixed(1);
    const noPct = Math.max(0, 100 - item.primaryMetric).toFixed(1);
    const body = [
      item.title,
      `YES: ${yesPct}%   NO: ${noPct}%`,
      `${item.volumeText} | ${item.secondaryText}`,
      alertLine,
      '[Click: Arm/Clear Alert] [2xClick: Back]',
    ].join('\n');
    return truncateUtf8(body, 980);
  }

  const body = [
    `${item.symbol} — ${item.title}`,
    `Price: $${item.primaryMetric.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,
    `24h / Source: ${item.secondaryText} (${item.source})`,
    `${item.volumeText}`,
    alertLine,
    '[Click: Arm/Clear Alert] [2xClick: Back]',
  ].join('\n');
  return truncateUtf8(body, 980);
}

export function evaluateAlert(item: MarketItem, threshold: number | undefined): boolean {
  if (threshold === undefined) return false;
  return item.primaryMetric >= threshold;
}
