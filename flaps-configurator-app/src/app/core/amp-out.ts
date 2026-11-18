/**
 * AMP_OUT przychodzi jako surowy odczyt ADC STM32: 16 bitów, 0–65535, odniesienie 3,3 V
 * (README firmware, „Co oznacza wartość AMP_OUT”). To napięcie z linii pomiaru, nie prąd:
 * DRV8212P nie ma wyjścia prądowego, prąd daje dopiero zewnętrzny shunt (i ew. wzmacniacz).
 */
export const AMP_OUT_FULL_SCALE = 65535;
export const AMP_OUT_VREF_MV = 3300;

/** U [mV] = raw × 3300 / 65535. */
export function ampOutMillivolts(raw: number): number {
  return (raw * AMP_OUT_VREF_MV) / AMP_OUT_FULL_SCALE;
}

/** Napięcie do wyświetlenia, np. "4.0 mV". */
export function formatAmpOutMillivolts(raw: number): string {
  return `${ampOutMillivolts(raw).toFixed(1)} mV`;
}

/**
 * Obwód pomiaru prądu na płytce — ustawienia aplikacji, nie stałe (wartości będą znane
 * po poprawce sprzętu). null = nieznane, wtedy prądu nie liczymy.
 */
export interface CurrentSenseSettings {
  shuntOhms: number | null;
  gain: number | null;
}

export const NO_CURRENT_SENSE: CurrentSenseSettings = { shuntOhms: null, gain: null };

/** I [A] = U / (R_shunt × wzmocnienie); null, gdy obwód nie jest opisany. */
export function ampOutAmps(raw: number, sense: CurrentSenseSettings): number | null {
  const { shuntOhms, gain } = sense;
  if (!shuntOhms || !gain || shuntOhms <= 0 || gain <= 0) {
    return null;
  }
  return ampOutMillivolts(raw) / 1000 / (shuntOhms * gain);
}
