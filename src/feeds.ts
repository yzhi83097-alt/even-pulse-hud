import type { MarketItem } from './formatters';

interface RawGammaMarket {
  id?: string;
  question?: string;
  outcomePrices?: string | string[];
  volume24hr?: number | string;
  liquidity?: number | string;
  endDate?: string;
}

const FALLBACK_POLYMARKET: MarketItem[] = [
  {
    id: 'poly-fallback-1',
    feed: 'polymarket',
    symbol: 'NVDA',
    title: 'New NVIDIA CEO named by Dec 31, 2026?',
    primaryMetric: 14,
    secondaryText: 'Ends Dec 31',
    volumeText: 'Vol24h $1.2M',
    source: 'Offline Cache',
  },
  {
    id: 'poly-fallback-2',
    feed: 'polymarket',
    symbol: 'BTC',
    title: 'Bitcoin above $75,000 by year-end?',
    primaryMetric: 38,
    secondaryText: 'Ends Dec 31',
    volumeText: 'Vol24h $4.8M',
    source: 'Offline Cache',
  },
];

const FALLBACK_CRYPTO: MarketItem[] = [
  {
    id: 'crypto-btc',
    feed: 'crypto',
    symbol: 'BTC',
    title: 'Bitcoin (Hyperliquid + Spot)',
    primaryMetric: 58500,
    secondaryText: '-2.1%',
    volumeText: 'Perp Mid Feed',
    source: 'Offline Cache',
  },
  {
    id: 'crypto-ton',
    feed: 'crypto',
    symbol: 'TON',
    title: 'Toncoin (Spot)',
    primaryMetric: 0.93,
    secondaryText: '-4.1%',
    volumeText: 'Spot Feed',
    source: 'Offline Cache',
  },
];

function compactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${Math.round(val)}`;
}

export function parsePolymarketMarkets(raw: RawGammaMarket[]): MarketItem[] {
  const items: MarketItem[] = [];
  for (const m of raw) {
    if (!m.question) continue;
    let prices: string[] = [];
    if (Array.isArray(m.outcomePrices)) {
      prices = m.outcomePrices;
    } else if (typeof m.outcomePrices === 'string') {
      try {
        const parsed = JSON.parse(m.outcomePrices);
        if (Array.isArray(parsed)) prices = parsed.map(String);
      } catch {
        continue;
      }
    }
    const yesProb = Number(prices[0] ?? 0.5) * 100;
    const vol = Number(m.volume24hr ?? 0);
    const liq = Number(m.liquidity ?? 0);
    items.push({
      id: `poly-${m.id ?? items.length}`,
      feed: 'polymarket',
      symbol: 'POLY',
      title: m.question,
      primaryMetric: Number.isFinite(yesProb) ? Math.min(99.9, Math.max(0.1, yesProb)) : 50,
      secondaryText: `Liq ${compactUsd(liq)}`,
      volumeText: `Vol24h ${compactUsd(vol)}`,
      source: 'Polymarket Gamma API',
    });
  }
  return items;
}

export async function fetchPolymarketFeed(): Promise<{ items: MarketItem[]; live: boolean }> {
  try {
    const res = await fetch(
      'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=10&order=volume24hr&ascending=false',
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as RawGammaMarket[];
    const parsed = parsePolymarketMarkets(data);
    if (parsed.length > 0) return { items: parsed, live: true };
  } catch {
    // Fall back gracefully
  }
  return { items: FALLBACK_POLYMARKET, live: false };
}

export async function fetchCryptoFeed(): Promise<{ items: MarketItem[]; live: boolean }> {
  try {
    const [hlRes, cgRes] = await Promise.all([
      fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      }),
      fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,the-open-network,hyperliquid&vs_currencies=usd&include_24hr_change=true',
      ),
    ]);

    const mids = hlRes.ok ? ((await hlRes.json()) as Record<string, string>) : {};
    const cg = cgRes.ok
      ? ((await cgRes.json()) as Record<string, { usd?: number; usd_24h_change?: number }>)
      : {};

    const specs = [
      { id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', hlKey: 'BTC' },
      { id: 'ethereum', sym: 'ETH', name: 'Ethereum', hlKey: 'ETH' },
      { id: 'solana', sym: 'SOL', name: 'Solana', hlKey: 'SOL' },
      { id: 'the-open-network', sym: 'TON', name: 'Toncoin', hlKey: 'TON' },
      { id: 'hyperliquid', sym: 'HYPE', name: 'Hyperliquid', hlKey: 'HYPE' },
    ];

    const items: MarketItem[] = [];
    for (const s of specs) {
      const hlPrice = mids[s.hlKey] ? Number(mids[s.hlKey]) : undefined;
      const cgPrice = cg[s.id]?.usd;
      const price = hlPrice && Number.isFinite(hlPrice) ? hlPrice : cgPrice;
      if (!price || !Number.isFinite(price)) continue;
      const chg = cg[s.id]?.usd_24h_change;
      const chgText =
        typeof chg === 'number' && Number.isFinite(chg)
          ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
          : 'Live';
      items.push({
        id: `crypto-${s.sym.toLowerCase()}`,
        feed: 'crypto',
        symbol: s.sym,
        title: s.name,
        primaryMetric: price,
        secondaryText: chgText,
        volumeText: hlPrice ? 'Hyperliquid AllMids + Spot' : 'CoinGecko Spot',
        source: hlPrice ? 'Hyperliquid + CoinGecko' : 'CoinGecko',
      });
    }
    if (items.length > 0) return { items, live: true };
  } catch {
    // Fall back gracefully
  }
  return { items: FALLBACK_CRYPTO, live: false };
}
