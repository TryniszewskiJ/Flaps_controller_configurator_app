import { conditionText, conditionTree } from '../core/condition';
import { FlapsState } from '../core/protocol/gen/flaps_common_pb';
import { Logic } from '../core/protocol/gen/flaps_logic_pb';
import { t } from '../core/i18n/i18n';

/** Tyle z sygnału potrzebuje edytor logik — nazwa (indeks = pozycja na liście). */
export interface SignalName {
  name: string;
}

/** Najwięcej logik w sterowniku (MaxLogics w firmware). */
export const MAX_LOGICS = 10;

/** Bajty UTF-8 opisu logiki, bez NUL (Logic.description w firmware). */
export const LOGIC_DESCRIPTION_MAX_BYTES = 31;

/**
 * Działanie logiki w jednym zdaniu, z nazwą sygnału wejściowego — albo bez niej (`hideInput`,
 * aplikacja użytkownika: sygnał ustawia technik).
 */
export function logicSummary(
  logic: Logic,
  signals: readonly SignalName[],
  options: { hideInput?: boolean } = {},
): string {
  const input = logic.inputSignal !== undefined ? signals[logic.inputSignal]?.name : undefined;
  const name = input ?? t('summary.noSignal');

  switch (logic.parameters.case) {
    case 'fixed':
      return logic.parameters.value.state === FlapsState.OPEN
        ? t('summary.alwaysOpen')
        : t('summary.alwaysClosed');
    case 'simpleSwitch':
      return t(options.hideInput ? 'summary.switchNoInput' : 'summary.switch', {
        name,
        open: logic.parameters.value.openValue,
        close: logic.parameters.value.closeValue,
      });
    case 'hysteresis':
      return t(options.hideInput ? 'summary.hysteresisNoInput' : 'summary.hysteresis', {
        name,
        open: roundFloat(logic.parameters.value.openAbove),
        close: roundFloat(logic.parameters.value.closeBelow),
      });
    case 'condition': {
      const tree = conditionTree(logic.parameters.value.nodes);
      const signalName = (i: number): string =>
        signals[i]?.name ?? t('condition.signalFallback', { n: i + 1 });
      return tree
        ? t('summary.condition', { condition: conditionText(tree, signalName) })
        : t('summary.invalidCondition');
    }
    default:
      return t('summary.noParameters');
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
