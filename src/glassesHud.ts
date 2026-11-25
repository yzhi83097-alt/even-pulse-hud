import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import {
  evaluateAlert,
  formatDetailText,
  formatListRow,
  truncateUtf8,
  type FeedMode,
  type MarketItem,
} from './formatters';

export type GlassesView = 'list' | 'detail';

export interface HudState {
  feed: FeedMode;
  view: GlassesView;
  items: MarketItem[];
  selectedIndex: number;
  alerts: Record<string, number>;
  triggeredId: string | null;
  liveApi: boolean;
  lastUpdated: string;
}

const MENU_CONFIG = new MenuContainerProperty({
  menuItems: [
    new MenuItemProperty({ itemID: 1, itemName: 'Switch Feed (Poly/Crypto)' }),
    new MenuItemProperty({ itemID: 2, itemName: 'Refresh Live Data' }),
    new MenuItemProperty({ itemID: 3, itemName: 'Arm / Clear Alert' }),
    new MenuItemProperty({ itemID: 4, itemName: 'Simulate Spike Alert' }),
  ],
});

export class GlassesHudController {
  private bridge: EvenAppBridge | null = null;
  private startupCreated = false;
  private onEventLog: (msg: string) => void;
  private onAction: (action: 'switchFeed' | 'refresh' | 'toggleAlert' | 'simulateAlert' | 'select', index?: number) => void;

  constructor(opts: {
    onEventLog: (msg: string) => void;
    onAction: (action: 'switchFeed' | 'refresh' | 'toggleAlert' | 'simulateAlert' | 'select', index?: number) => void;
  }) {
    this.onEventLog = opts.onEventLog;
    this.onAction = opts.onAction;
  }

  async connect(timeoutMs = 1500): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const hasFlutterBridge = Boolean(
      (window as unknown as { flutter_inappwebview?: unknown }).flutter_inappwebview,
    );
    if (!hasFlutterBridge) {
      this.onEventLog('Browser preview mode (EvenApp WebView handler not injected)');
      return false;
    }

    try {
      const bridge = await Promise.race([
        waitForEvenAppBridge(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bridge timeout')), timeoutMs),
        ),
      ]);
      this.bridge = bridge;
      this.onEventLog('Connected to EvenAppBridge');

      bridge.onLaunchSource((src) => {
        this.onEventLog(`Launch source: ${src}`);
      });

      bridge.onEvenHubEvent((evt) => {
        this.handleEvenHubEvent(evt);
      });
      return true;
    } catch (err) {
      this.onEventLog(`Bridge unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  isConnected(): boolean {
    return this.bridge !== null;
  }

  private currentView: GlassesView = 'list';

  private handleEvenHubEvent(evt: EvenHubEvent) {
    if (evt.menuItemClickEvent?.itemID) {
      const id = evt.menuItemClickEvent.itemID;
      this.onEventLog(`Menu click itemID=${id}`);
      if (id === 1) this.onAction('switchFeed');
      else if (id === 2) this.onAction('refresh');
      else if (id === 3) this.onAction('toggleAlert');
      else if (id === 4) this.onAction('simulateAlert');
      return;
    }

    if (evt.listEvent) {
      const idx = evt.listEvent.currentSelectItemIndex ?? 0;
      const et = evt.listEvent.eventType ?? OsEventTypeList.CLICK_EVENT;
      this.onEventLog(`List event type=${et} idx=${idx}`);
      if (et === OsEventTypeList.CLICK_EVENT) {
        this.onAction('select', idx);
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onAction('switchFeed');
      }
      return;
    }

    if (evt.textEvent) {
      const et = evt.textEvent.eventType ?? OsEventTypeList.CLICK_EVENT;
      this.onEventLog(`Text event type=${et}`);
      if (et === OsEventTypeList.CLICK_EVENT) {
        this.onAction('toggleAlert');
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        this.onAction('select', -1);
      }
      return;
    }

    if (evt.sysEvent) {
      const et = evt.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT;
      this.onEventLog(`Sys event type=${et} view=${this.currentView}`);
      if (et === OsEventTypeList.CLICK_EVENT) {
        if (this.currentView === 'detail') this.onAction('toggleAlert');
      } else if (et === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        if (this.currentView === 'detail') {
          this.onAction('select', -1);
        } else {
          this.onAction('switchFeed');
        }
      }
    }
  }

  private buildHeaderText(state: HudState): string {
    const feedTag = state.feed === 'polymarket' ? 'POLYMARKET' : 'CRYPTO/TON';
    const srcTag = state.liveApi ? 'LIVE' : 'CACHE';
    if (state.triggeredId) {
      const hit = state.items.find((i) => i.id === state.triggeredId);
      return truncateUtf8(`! ALERT: ${hit ? hit.symbol : feedTag} TARGET HIT !`, 90);
    }
    return truncateUtf8(`EVENPULSE · ${feedTag} [${srcTag}] ${state.lastUpdated}`, 90);
  }

  async render(state: HudState): Promise<void> {
    this.currentView = state.view;
    if (!this.bridge) return;

    const headerObj = new TextContainerProperty({
      xPosition: 10,
      yPosition: 6,
      width: 556,
      height: 36,
      containerID: 1,
      containerName: 'hud-header',
      zOrderIndex: 1,
      content: this.buildHeaderText(state),
      textColor: state.triggeredId ? 4 : 3,
      isEventCapture: 0,
    });

    if (state.view === 'list') {
      const capped = state.items.slice(0, 12);
      const rows = capped.map((item) => formatListRow(item, state.alerts[item.id] !== undefined));
      const listObj = new ListContainerProperty({
        xPosition: 10,
        yPosition: 46,
        width: 556,
        height: 236,
        containerID: 2,
        containerName: 'hud-list',
        zOrderIndex: 2,
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: rows.length,
          itemWidth: 540,
          isItemSelectBorderEn: 1,
          itemName: rows,
        }),
      });

      if (!this.startupCreated) {
        const res = await this.bridge.createStartUpPageContainer(
          new CreateStartUpPageContainer({
            containerTotalNum: 2,
            textObject: [headerObj],
            listObject: [listObj],
            menuObject: MENU_CONFIG,
          }),
        );
        this.startupCreated = res === StartUpPageCreateResult.success;
        this.onEventLog(`createStartUpPageContainer -> ${res}`);
      } else {
        await this.bridge.rebuildPageContainer(
          new RebuildPageContainer({
            containerTotalNum: 2,
            textObject: [headerObj],
            listObject: [listObj],
            menuObject: MENU_CONFIG,
          }),
        );
      }
      return;
    }

    const selected = state.items[state.selectedIndex] ?? state.items[0];
    const threshold = selected ? state.alerts[selected.id] : undefined;
    const isHit = selected
      ? state.triggeredId === selected.id || evaluateAlert(selected, threshold)
      : false;
    const detailContent = selected
      ? formatDetailText(selected, threshold, isHit)
      : 'No item selected.\n[Double-click to go back]';

    const detailObj = new TextContainerProperty({
      xPosition: 10,
      yPosition: 48,
      width: 556,
      height: 232,
      containerID: 3,
      containerName: 'hud-detail',
      zOrderIndex: 2,
      content: detailContent,
      textColor: 4,
      isEventCapture: 1,
    });

    await this.bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 2,
        textObject: [headerObj, detailObj],
        menuObject: MENU_CONFIG,
      }),
    );
  }
}
