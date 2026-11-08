/**
 * AMP_OUT z mostka H (DRV8212P) przychodzi jako surowy odczyt ADC STM32: 16 bitów, 0–65535
 * (README firmware, „Pomiar prądu”). Firmware nie podaje przeliczenia — napięcie liczymy
 * przy założeniu napięcia odniesienia ADC 3,3 V.
 */
export const AMP_OUT_FULL_SCALE = 65535;
export const AMP_OUT_VREF_VOLTS = 3.3;

export function ampOutVolts(raw: number): number {
  return (raw / AMP_OUT_FULL_SCALE) * AMP_OUT_VREF_VOLTS;
}

/** Napięcie do wyświetlenia, np. "1.234 V". */
export function formatAmpOutVolts(raw: number): string {
  return `${ampOutVolts(raw).toFixed(3)} V`;
}
