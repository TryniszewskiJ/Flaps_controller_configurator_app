import { CanFrame, FlapsState, Logic, Signal } from '../core/protocol/gen/flaps_pb';

/** ID ramki w hex: 0x180, extended z 8 cyframi (0x18FF0001). */
export function frameId(frame: Pick<CanFrame, 'id' | 'extendedId'>): string {
  return `0x${frame.id
    .toString(16)
    .toUpperCase()
    .padStart(frame.extendedId ? 8 : 3, '0')}`;
}

export function frameLabel(frame: CanFrame): string {
  return frame.extendedId ? `${frameId(frame)} (ext)` : frameId(frame);
}

/** Położenie sygnału w skrócie: „bit 7 · 16 b · Motorola”. */
export function signalLayoutLabel(signal: Signal): string {
  const order = signal.bigEndian ? 'Motorola' : 'Intel';
  return `bit ${signal.startingBit} · ${signal.lengthBits} b · ${order}`;
}

export function signalScaleLabel(signal: Signal): string {
  const scale = `× ${roundFloat(signal.scale)}`;
  return signal.bias
    ? `${scale} ${signal.bias > 0 ? '+' : '−'} ${Math.abs(roundFloat(signal.bias))}`
    : scale;
}

export function flapsStateLabel(state: FlapsState): string {
  return state === FlapsState.OPEN ? 'otwarte' : 'zamknięte';
}

/** Działanie logiki w jednym zdaniu, z nazwą sygnału wejściowego. */
export function logicSummary(logic: Logic, signals: Signal[]): string {
  const input = logic.inputSignal !== undefined ? signals[logic.inputSignal]?.name : undefined;
  const name = input ?? '(brak sygnału)';

  switch (logic.parameters.case) {
    case 'fixed':
      return logic.parameters.value.state === FlapsState.OPEN
        ? 'Zawsze otwarte'
        : 'Zawsze zamknięte';
    case 'simpleSwitch':
      return `${name} = ${logic.parameters.value.openValue} otwórz, = ${logic.parameters.value.closeValue} zamknij`;
    case 'hysteresis':
      return `${name} > ${roundFloat(logic.parameters.value.openAbove)} otwórz, < ${roundFloat(logic.parameters.value.closeBelow)} zamknij`;
    default:
      return 'Brak parametrów';
  }
}

/** Liczba z pola tekstowego (przecinek dziesiętny też działa); NaN, gdy to nie liczba. */
export function parseNumber(value: string): number {
  const text = value.trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
}

export function parseInteger(value: string): number {
  const number = parseNumber(value);
  return Number.isInteger(number) ? number : NaN;
}

/** Długość tekstu w bajtach UTF-8 — tak liczy firmware. */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Float z protokołu bez szumu pojedynczej precyzji (0.10000000149 → 0.1). */
export function roundFloat(value: number): number {
  return Number(value.toPrecision(7));
}
