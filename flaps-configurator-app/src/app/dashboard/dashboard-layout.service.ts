import { Injectable, computed, signal } from '@angular/core';

export type DashboardWidgetId =
  | 'drive-mode'
  | 'flaps'
  | 'signals'
  | 'actions'
  | 'command'
  | 'amp-out'
  | 'device-log'
  | 'frame-log';

export interface DashboardWidget {
  id: DashboardWidgetId;
  title: string;
  /** Skąd pochodzi sekcja (podpis w liście dodawania). */
  source: 'Dashboard' | 'Dev console';
}

/** Wszystkie sekcje, które można położyć na Dashboard, w kolejności listy dodawania. */
export const DASHBOARD_WIDGETS: readonly DashboardWidget[] = [
  { id: 'drive-mode', title: 'Tryb jazdy', source: 'Dashboard' },
  { id: 'flaps', title: 'Stan klap', source: 'Dashboard' },
  { id: 'signals', title: 'Stan zmiennych', source: 'Dashboard' },
  { id: 'actions', title: 'Akcje', source: 'Dashboard' },
  { id: 'command', title: 'Komenda', source: 'Dev console' },
  { id: 'amp-out', title: 'AMP_OUT', source: 'Dev console' },
  { id: 'device-log', title: 'Logi sterownika', source: 'Dev console' },
  { id: 'frame-log', title: 'Ramki BLE', source: 'Dev console' },
];

export const DEFAULT_DASHBOARD: readonly DashboardWidgetId[] = [
  'drive-mode',
  'flaps',
  'signals',
  'actions',
];

const STORAGE_KEY = 'flaps.dashboardWidgets';

/** Sekcje widoczne na Dashboard i ich kolejność — zapamiętane na tym urządzeniu. */
@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  private readonly _widgets = signal<DashboardWidgetId[]>(load());

  /** Sekcje na Dashboard, od góry. */
  readonly widgets = this._widgets.asReadonly();
  /** Sekcje, których jeszcze nie ma na Dashboard. */
  readonly available = computed(() =>
    DASHBOARD_WIDGETS.filter((widget) => !this._widgets().includes(widget.id)),
  );

  add(id: DashboardWidgetId): void {
    if (!this._widgets().includes(id)) {
      this.save([...this._widgets(), id]);
    }
  }

  remove(id: DashboardWidgetId): void {
    this.save(this._widgets().filter((widget) => widget !== id));
  }

  /** Przesuwa sekcję o `delta` pozycji (−1 w górę, 1 w dół). */
  move(id: DashboardWidgetId, delta: number): void {
    const widgets = [...this._widgets()];
    const from = widgets.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= widgets.length) {
      return;
    }
    widgets.splice(from, 1);
    widgets.splice(to, 0, id);
    this.save(widgets);
  }

  reset(): void {
    this.save([...DEFAULT_DASHBOARD]);
  }

  private save(widgets: DashboardWidgetId[]): void {
    this._widgets.set(widgets);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch {
      // brak dostępu do pamięci — układ działa do zamknięcia aplikacji
    }
  }
}

export function widgetTitle(id: DashboardWidgetId): string {
  return DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.title ?? id;
}

function load(): DashboardWidgetId[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown;
    if (Array.isArray(stored)) {
      const known = new Set<string>(DASHBOARD_WIDGETS.map((widget) => widget.id));
      // Bez nieznanych (starsza / nowsza wersja aplikacji) i powtórzeń
      return [...new Set(stored)].filter(
        (id): id is DashboardWidgetId => typeof id === 'string' && known.has(id),
      );
    }
  } catch {
    // uszkodzony wpis albo brak dostępu do pamięci
  }
  return [...DEFAULT_DASHBOARD];
}
