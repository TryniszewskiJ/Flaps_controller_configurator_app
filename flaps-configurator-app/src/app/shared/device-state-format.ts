import { DeviceState, FlapPosition } from '../core/protocol/gen/flaps_state_pb';
import { TranslationKey, t } from '../core/i18n/i18n';

/** Nazwy z konfiguracji urządzenia — u technika z GET_CONFIGURATION, u użytkownika z GET_LOGICS. */
export interface DeviceNames {
  /** Opisy logik, po indeksie. */
  logics: readonly string[];
  /** Nazwy sygnałów, po indeksie. */
  signals: readonly string[];
}

export type FlapTone = 'open' | 'closed' | 'moving' | 'unknown' | 'off';

export interface FlapView {
  name: string;
  label: string;
  tone: FlapTone;
}

export interface SignalView {
  index: number;
  name: string;
  value: string;
  fresh: boolean;
}

const FLAP_LABELS: Partial<Record<FlapPosition, TranslationKey>> = {
  [FlapPosition.UNKNOWN]: 'flap.unknown',
  [FlapPosition.OPENING]: 'flap.opening',
  [FlapPosition.OPEN]: 'flap.open',
  [FlapPosition.CLOSING]: 'flap.closing',
  [FlapPosition.CLOSED]: 'flap.closed',
  [FlapPosition.NOT_CONNECTED]: 'flap.notConnected',
};

/** Położenie klapy słownie, w bieżącym języku. */
export function flapLabel(position: FlapPosition): string {
  const key = FLAP_LABELS[position];
  return key ? t(key) : '—';
}

export function flapTone(position: FlapPosition): FlapTone {
  switch (position) {
    case FlapPosition.OPEN:
      return 'open';
    case FlapPosition.CLOSED:
      return 'closed';
    case FlapPosition.OPENING:
    case FlapPosition.CLOSING:
      return 'moving';
    case FlapPosition.NOT_CONNECTED:
      return 'off';
    default:
      return 'unknown';
  }
}

export function flapView(name: string, position: FlapPosition): FlapView {
  return { name, label: flapLabel(position), tone: flapTone(position) };
}

/** Klapa otwarta albo w trakcie otwierania. */
export function isOpening(position: FlapPosition): boolean {
  return position === FlapPosition.OPEN || position === FlapPosition.OPENING;
}

/** Aktywna logika (tryb jazdy) z nazwą z konfiguracji; null bez stanu. */
export function activeLogicLabel(
  state: DeviceState | null,
  names: DeviceNames | null,
): string | null {
  if (!state) {
    return null;
  }
  if (state.activeLogic < 0) {
    return t('state.safe');
  }
  return names?.logics[state.activeLogic] || t('state.modeFallback', { n: state.activeLogic + 1 });
}

/** Sygnały w kolejności z konfiguracji, z nazwami z konfiguracji urządzenia. */
export function signalViews(state: DeviceState | null, names: DeviceNames | null): SignalView[] {
  const signalNames = names?.signals ?? [];
  return [...(state?.signals ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      index: s.index,
      name: signalNames[s.index] || t('state.signalFallback', { n: s.index + 1 }),
      value: formatSignalValue(s.value),
      fresh: s.fresh,
    }));
}

/** Wartość sygnału: całkowite bez części ułamkowej, reszta do 3 miejsc. */
export function formatSignalValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
