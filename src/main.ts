import './style.css';
import { fetchCryptoFeed, fetchPolymarketFeed } from './feeds';
import {
  evaluateAlert,
  formatDetailText,
  formatListRow,
  type FeedMode,
  type MarketItem,
} from './formatters';
import { GlassesHudController, type HudState } from './glassesHud';

const state: HudState = {
  feed: 'polymarket',
  view: 'list',
  items: [],
  selectedIndex: 0,
  alerts: {},
  triggeredId: null,
  liveApi: false,
  lastUpdated: '--:--:--',
};

const logs: string[] = [];

function pushLog(msg: string) {
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  logs.unshift(`[${ts}] ${msg}`);
  if (logs.length > 25) logs.pop();
  renderCompanion();
}

const hud = new GlassesHudController({
  onEventLog: pushLog,
  onAction: (action, idx) => {
    if (action === 'switchFeed') {
      void switchFeed(state.feed === 'polymarket' ? 'crypto' : 'polymarket');
    } else if (action === 'refresh') {
      void refreshFeed();
    } else if (action === 'select') {
      if (idx === -1) {
        state.view = 'list';
      } else if (typeof idx === 'number' && state.items[idx]) {
        state.selectedIndex = idx;
        state.view = 'detail';
      }
      void syncViews();
    } else if (action === 'toggleAlert') {
      toggleCurrentAlert();
    } else if (action === 'simulateAlert') {
      triggerSpikeAlert();
    }
  },
});

function toggleCurrentAlert() {
  const item = state.items[state.selectedIndex];
  if (!item) return;
  if (state.alerts[item.id] !== undefined) {
    delete state.alerts[item.id];
    if (state.triggeredId === item.id) state.triggeredId = null;
    pushLog(`Cleared alert for ${item.symbol}`);
  } else {
    const target =
      item.feed === 'polymarket'
        ? Math.min(99, Math.round(item.primaryMetric + 5))
        : Number((item.primaryMetric * 1.02).toFixed(2));
    state.alerts[item.id] = target;
    pushLog(`Armed alert on ${item.title.slice(0, 28)} >= ${target}`);
  }
  void syncViews();
}

function triggerSpikeAlert() {
  const item = state.items[state.selectedIndex] ?? state.items[0];
  if (!item) return;
  if (item.feed === 'polymarket') {
    item.primaryMetric = Math.min(98, Math.round(item.primaryMetric + 12));
    state.alerts[item.id] = Math.max(1, Math.round(item.primaryMetric - 2));
  } else {
    item.primaryMetric = Number((item.primaryMetric * 1.05).toFixed(2));
    item.secondaryText = '+5.0%';
    state.alerts[item.id] = Number((item.primaryMetric * 0.99).toFixed(2));
  }
  state.triggeredId = item.id;
  state.view = 'detail';
  pushLog(`Simulated spike alert on ${item.symbol}: ${item.primaryMetric}`);
  void syncViews();
}

async function refreshFeed() {
  const res =
    state.feed === 'polymarket' ? await fetchPolymarketFeed() : await fetchCryptoFeed();
  state.items = res.items;
  state.liveApi = res.live;
  state.lastUpdated = new Date().toLocaleTimeString('en-GB', { hour12: false });
  if (state.selectedIndex >= state.items.length) state.selectedIndex = 0;

  state.triggeredId = null;
  for (const it of state.items) {
    if (evaluateAlert(it, state.alerts[it.id])) {
      state.triggeredId = it.id;
      break;
    }
  }
  pushLog(`Fetched ${res.items.length} ${state.feed} items (live=${res.live})`);
  await syncViews();
}

async function switchFeed(next: FeedMode) {
  state.feed = next;
  state.view = 'list';
  state.selectedIndex = 0;
  await refreshFeed();
}

async function syncViews() {
  await hud.render(state);
  renderCompanion();
}

function renderGlassesPreviewText(): string {
  const feedLabel = state.feed === 'polymarket' ? 'POLYMARKET' : 'CRYPTO/TON';
  const hdr = state.triggeredId
    ? `! ALERT: TARGET HIT !`
    : `EVENPULSE · ${feedLabel} [${state.liveApi ? 'LIVE' : 'CACHE'}] ${state.lastUpdated}`;

  if (state.view === 'detail') {
    const selected = state.items[state.selectedIndex] ?? state.items[0];
    if (!selected) return `${hdr}\n\nNo item selected.`;
    const th = state.alerts[selected.id];
    return `${hdr}\n${'─'.repeat(46)}\n${formatDetailText(selected, th, state.triggeredId === selected.id)}`;
  }

  const lines = state.items.slice(0, 6).map((item, idx) => {
    const prefix = idx === state.selectedIndex ? '▶ ' : '  ';
    return `${prefix}${formatListRow(item, state.alerts[item.id] !== undefined)}`;
  });
  return `${hdr}\n${'─'.repeat(46)}\n${lines.join('\n')}`;
}

function renderCompanion() {
  const root = document.getElementById('app');
  if (!root) return;

  const selected: MarketItem | undefined = state.items[state.selectedIndex];

  root.innerHTML = `
    <div class="container">
      <header class="header">
        <div>
          <h1>EvenPulse HUD</h1>
          <p class="sub">Read-only Polymarket &amp; Crypto/TON Glanceable HUD for Even G2</p>
        </div>
        <span class="badge ${hud.isConnected() ? 'badge-live' : 'badge-sim'}">
          ${hud.isConnected() ? 'EvenHub Bridge Connected' : 'Web Companion + Preview'}
        </span>
      </header>

      <section class="g2-screen" aria-label="G2 576x288 Preview">
        <div class="g2-meta">576×288 G2 MONOCHROME HUD MIRROR · VIEW: ${state.view.toUpperCase()}</div>
        <pre class="g2-canvas">${escapeHtml(renderGlassesPreviewText())}</pre>
      </section>

      <section class="toolbar">
        <button id="btn-poly" class="btn ${state.feed === 'polymarket' ? 'btn-active' : ''}">Polymarket Odds</button>
        <button id="btn-crypto" class="btn ${state.feed === 'crypto' ? 'btn-active' : ''}">Hyperliquid + TON/SOL</button>
        <button id="btn-refresh" class="btn">Refresh Feed</button>
        <button id="btn-view" class="btn">${state.view === 'list' ? 'Inspect Selected' : 'Back to List'}</button>
        <button id="btn-alert" class="btn">${selected && state.alerts[selected.id] !== undefined ? 'Clear Alert' : 'Arm Alert'}</button>
        <button id="btn-spike" class="btn btn-warn">Simulate Spike</button>
      </section>

      <section class="watchlist">
        <h2>Watchlist (${state.items.length} feeds · ${state.liveApi ? 'Live Read-Only API' : 'Offline Snapshot'})</h2>
        <div class="rows">
          ${state.items
            .map(
              (item, idx) => `
            <button class="row ${idx === state.selectedIndex ? 'row-selected' : ''}" data-idx="${idx}">
              <span class="row-title">${escapeHtml(formatListRow(item, state.alerts[item.id] !== undefined))}</span>
              <span class="row-meta">${escapeHtml(item.volumeText)} · ${escapeHtml(item.source)}</span>
            </button>`,
            )
            .join('')}
        </div>
      </section>

      <section class="logs">
        <h2>Bridge &amp; Network Telemetry (Whitelist: gamma-api.polymarket.com, api.hyperliquid.xyz, api.coingecko.com)</h2>
        <pre class="log-box">${escapeHtml(logs.join('\n') || 'Initializing...')}</pre>
      </section>
    </div>
  `;

  document.getElementById('btn-poly')?.addEventListener('click', () => void switchFeed('polymarket'));
  document.getElementById('btn-crypto')?.addEventListener('click', () => void switchFeed('crypto'));
  document.getElementById('btn-refresh')?.addEventListener('click', () => void refreshFeed());
  document.getElementById('btn-view')?.addEventListener('click', () => {
    state.view = state.view === 'list' ? 'detail' : 'list';
    void syncViews();
  });
  document.getElementById('btn-alert')?.addEventListener('click', toggleCurrentAlert);
  document.getElementById('btn-spike')?.addEventListener('click', triggerSpikeAlert);

  root.querySelectorAll<HTMLButtonElement>('.row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx ?? 0);
      state.selectedIndex = idx;
      state.view = 'detail';
      void syncViews();
    });
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function boot() {
  renderCompanion();
  await hud.connect();
  await refreshFeed();
  setInterval(() => {
    void refreshFeed();
  }, 45_000);
}

void boot();
