import { OverrideDuration } from '../core/device-state.service';
import { t } from '../core/i18n/i18n';

/** Czas ręcznego sterowania do wyboru. */
export interface OverrideOption {
  value: OverrideDuration;
  /** Np. „na 5 min” — w bieżącym języku. */
  readonly label: string;
}

function minutes(n: number): OverrideOption {
  return {
    value: n * 60_000,
    get label(): string {
      return t('override.minutes', { n });
    },
  };
}

/** Czasowe (firmware przyjmuje do 10 min) i stałe — do oddania sterowania albo resetu. */
export const OVERRIDE_OPTIONS: readonly OverrideOption[] = [
  minutes(1),
  minutes(5),
  minutes(10),
  {
    value: 'permanent',
    get label(): string {
      return t('override.permanent');
    },
  },
];

/** Pozostały czas ręcznego sterowania, np. "4:32"; null bez odliczania (brak albo stałe). */
export function overrideRemainingLabel(until: number | null, now: number): string | null {
  if (until === null) {
    return null;
  }
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
