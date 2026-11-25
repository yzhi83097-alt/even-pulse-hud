# EvenPulse HUD — Even Realities G2 Smart Glasses App

**Heads Up: Even Realities Hackathon** submission (Track: **Crypto & DeFi**).

- **Demo Video**: https://youtu.be/_58IkIk5bqE
- **Packaged `.ehpk` Build**: [even-pulse-hud-0.1.0.ehpk](demo/even-pulse-hud-0.1.0.ehpk)

EvenPulse HUD brings glanceable, read-only **Polymarket prediction market odds** and **Hyperliquid / CoinGecko spot & perp feeds (BTC, ETH, SOL, TON, HYPE)** directly onto the **Even Realities G2 576×288 monochrome green HUD**, paired with tap / R1 ring controls and threshold spike alerts.

## Features
- **Read-Only Live Markets (Zero Keys / Zero Risk)**: Fetches public market probabilities from Polymarket Gamma API and spot/perp mids from Hyperliquid + CoinGecko. Falls back cleanly to cached snapshots offline.
- **Native EvenHub G2 Containers (`@evenrealities/even_hub_sdk`)**:
  - `TextContainerProperty` live header with alert flash state.
  - `ListContainerProperty` scrollable watchlist enforcing G2's 63-byte item limit.
  - `TextContainerProperty` detail inspector (`click` to arm/clear price or probability alert, `double_click` to return).
  - `MenuContainerProperty` contextual menu (`Switch Feed`, `Refresh Live Data`, `Arm / Clear Alert`, `Simulate Spike Alert`).
- **Companion WebView Console**: Mirrors the 576×288 HUD state, shows network whitelist telemetry (`app.json`), and lets you arm or simulate spike alerts.

## Verification & Local Run
```bash
npm install
npm test
npm run build
npx evenhub pack app.json dist
```

To preview inside the official EvenHub Simulator:
```bash
npm run preview -- --port 4173
npx evenhub-simulator http://localhost:4173 --automation-port 9898
```

## Disclosure
All code in this repository was written fresh for the Heads Up: Even Realities Hackathon (Nov 25, 2026) using only public read-only market APIs and the official `@evenrealities/even_hub_sdk`.
