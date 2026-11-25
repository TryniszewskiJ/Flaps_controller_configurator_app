import { create } from '@bufbuild/protobuf';
import {
  ConditionNode,
  ConditionNodeSchema,
  ConditionNodeType,
} from './protocol/gen/flaps_logic_pb';
import { t } from './i18n/i18n';

/** Limity firmware (flaps.options, validateConfiguration). */
export const MAX_CONDITION_NODES = 12;
export const MAX_CONDITION_FOR_MS = 60_000;

export type CompareType =
  | ConditionNodeType.CONDITION_NODE_EQUAL
  | ConditionNodeType.CONDITION_NODE_NOT_EQUAL
  | ConditionNodeType.CONDITION_NODE_GREATER
  | ConditionNodeType.CONDITION_NODE_GREATER_OR_EQUAL
  | ConditionNodeType.CONDITION_NODE_LESS
  | ConditionNodeType.CONDITION_NODE_LESS_OR_EQUAL
  | ConditionNodeType.CONDITION_NODE_HYSTERESIS;

/** Logika warunkowa jest od protokołu 1.12, węzeł HYSTERESIS od 1.13. */
export const CONDITION_MINOR = 12;
export const CONDITION_HYSTERESIS_MINOR = 13;

export const COMPARE_TYPES: { value: CompareType; label: string }[] = [
  { value: ConditionNodeType.CONDITION_NODE_GREATER, label: '>' },
  { value: ConditionNodeType.CONDITION_NODE_GREATER_OR_EQUAL, label: '≥' },
  { value: ConditionNodeType.CONDITION_NODE_LESS, label: '<' },
  { value: ConditionNodeType.CONDITION_NODE_LESS_OR_EQUAL, label: '≤' },
  { value: ConditionNodeType.CONDITION_NODE_EQUAL, label: '=' },
  { value: ConditionNodeType.CONDITION_NODE_NOT_EQUAL, label: '≠' },
  {
    value: ConditionNodeType.CONDITION_NODE_HYSTERESIS,
    get label(): string {
      return t('condition.hysteresis');
    },
  },
];

/**
 * Warunek jako drzewo (do edycji). Firmware dostaje je jako listę węzłów w kolejności
 * postfiksowej. `forMs` — wynik węzła prawdziwy dopiero, gdy był prawdziwy tyle ms.
 * Histereza: prawda powyżej `value`, fałsz poniżej `closeBelow`, pomiędzy bez zmian.
 */
export type ConditionTree =
  | {
      kind: 'compare';
      type: CompareType;
      signal: number;
      value: number;
      /** Tylko histereza: dolny próg, ≤ value. */
      closeBelow?: number;
      forMs: number;
    }
  | { kind: 'group'; op: 'and' | 'or'; children: ConditionTree[]; forMs: number }
  | { kind: 'not'; child: ConditionTree; forMs: number };

export function isCompareType(type: ConditionNodeType): type is CompareType {
  return (
    (type >= ConditionNodeType.CONDITION_NODE_EQUAL &&
      type <= ConditionNodeType.CONDITION_NODE_LESS_OR_EQUAL) ||
    type === ConditionNodeType.CONDITION_NODE_HYSTERESIS
  );
}

/** Drzewo z listy postfiksowej; null, gdy lista nie jest poprawnym drzewem. */
export function conditionTree(nodes: ConditionNode[]): ConditionTree | null {
  const stack: ConditionTree[] = [];
  for (const node of nodes) {
    const forMs = node.forMs;
    if (isCompareType(node.type)) {
      stack.push({
        kind: 'compare',
        type: node.type,
        signal: node.signal,
        value: node.value,
        ...(node.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS && {
          closeBelow: node.closeBelow,
        }),
        forMs,
      });
    } else if (
      node.type === ConditionNodeType.CONDITION_NODE_AND ||
      node.type === ConditionNodeType.CONDITION_NODE_OR
    ) {
      if (node.operands < 2 || node.operands > stack.length) {
        return null;
      }
      const children = stack.splice(stack.length - node.operands);
      const op = node.type === ConditionNodeType.CONDITION_NODE_AND ? 'and' : 'or';
      stack.push({ kind: 'group', op, children, forMs });
    } else if (node.type === ConditionNodeType.CONDITION_NODE_NOT) {
      const child = stack.pop();
      if (!child) {
        return null;
      }
      stack.push({ kind: 'not', child, forMs });
    } else {
      return null;
    }
  }
  return stack.length === 1 ? stack[0] : null;
}

/**
 * Lista postfiksowa dla firmware. Grupa z jednym warunkiem to sam warunek (czasy się sumują:
 * „x przez a, potem przez b” = „x przez a + b”); pusta grupa nie daje węzłów.
 */
export function conditionNodes(tree: ConditionTree): ConditionNode[] {
  const nodes: ConditionNode[] = [];
  emit(simplify(tree), nodes);
  return nodes;
}

/** Pierwszy błąd warunku (jak INVALID_CONDITION w firmware) albo null. */
export function conditionError(tree: ConditionTree, signalCount: number): string | null {
  const simple = simplify(tree);
  if (!simple) {
    return t('condition.error.empty');
  }
  const count = countNodes(simple);
  if (count > MAX_CONDITION_NODES) {
    return t('condition.error.tooBig', { count, max: MAX_CONDITION_NODES });
  }
  return nodeError(simple, signalCount);
}

/** Liczba węzłów, które trafią do firmware. */
export function conditionSize(tree: ConditionTree): number {
  const simple = simplify(tree);
  return simple ? countNodes(simple) : 0;
}

/** Warunek w jednej linii, np. "(RPM > 4000 LUB pedał > 80 przez 300 ms) I NIE tryb = 2". */
export function conditionText(tree: ConditionTree, signalName: (index: number) => string): string {
  const simple = simplify(tree);
  return simple ? text(simple, signalName, true) : t('condition.empty');
}

/** Czy warunek ma węzeł histerezy (urządzenie < 1.13 go nie zna). */
export function conditionUsesHysteresis(tree: ConditionTree): boolean {
  switch (tree.kind) {
    case 'compare':
      return tree.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS;
    case 'not':
      return conditionUsesHysteresis(tree.child);
    case 'group':
      return tree.children.some(conditionUsesHysteresis);
  }
}

/** Czy warunek używa sygnału. */
export function conditionUsesSignal(nodes: ConditionNode[], index: number): boolean {
  return nodes.some((node) => isCompareType(node.type) && node.signal === index);
}

type Simple = ConditionTree | null;

function simplify(tree: ConditionTree): Simple {
  switch (tree.kind) {
    case 'compare':
      return tree;
    case 'not': {
      const child = simplify(tree.child);
      return child ? { ...tree, child } : null;
    }
    case 'group': {
      const children = tree.children.map(simplify).filter((c): c is ConditionTree => !!c);
      if (children.length === 0) {
        return null;
      }
      if (children.length === 1) {
        return { ...children[0], forMs: children[0].forMs + tree.forMs };
      }
      return { ...tree, children };
    }
  }
}

function emit(tree: Simple, nodes: ConditionNode[]): void {
  if (!tree) {
    return;
  }
  switch (tree.kind) {
    case 'compare':
      nodes.push(
        create(ConditionNodeSchema, {
          type: tree.type,
          signal: tree.signal,
          // Pole float w protokole — ta sama wartość, co wróci z urządzenia
          value: Math.fround(tree.value),
          closeBelow:
            tree.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS
              ? Math.fround(tree.closeBelow ?? 0)
              : 0,
          forMs: tree.forMs,
        }),
      );
      return;
    case 'not':
      emit(tree.child, nodes);
      nodes.push(
        create(ConditionNodeSchema, {
          type: ConditionNodeType.CONDITION_NODE_NOT,
          forMs: tree.forMs,
        }),
      );
      return;
    case 'group':
      tree.children.forEach((child) => emit(child, nodes));
      nodes.push(
        create(ConditionNodeSchema, {
          type:
            tree.op === 'and'
              ? ConditionNodeType.CONDITION_NODE_AND
              : ConditionNodeType.CONDITION_NODE_OR,
          operands: tree.children.length,
          forMs: tree.forMs,
        }),
      );
  }
}

function countNodes(tree: ConditionTree): number {
  switch (tree.kind) {
    case 'compare':
      return 1;
    case 'not':
      return 1 + countNodes(tree.child);
    case 'group':
      return 1 + tree.children.reduce((sum, child) => sum + countNodes(child), 0);
  }
}

function nodeError(tree: ConditionTree, signalCount: number): string | null {
  if (!Number.isInteger(tree.forMs) || tree.forMs < 0 || tree.forMs > MAX_CONDITION_FOR_MS) {
    return t('condition.error.forRange', { max: MAX_CONDITION_FOR_MS });
  }
  switch (tree.kind) {
    case 'compare':
      if (tree.signal >= signalCount) {
        return t('condition.error.noSignal');
      }
      if (!Number.isFinite(tree.value)) {
        return t('condition.error.value');
      }
      if (tree.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS) {
        const closeBelow = tree.closeBelow ?? NaN;
        if (!Number.isFinite(closeBelow)) {
          return t('condition.error.hysteresisValue');
        }
        if (closeBelow > tree.value) {
          return t('condition.error.hysteresisOrder');
        }
      }
      return null;
    case 'not':
      return nodeError(tree.child, signalCount);
    case 'group':
      for (const child of tree.children) {
        const error = nodeError(child, signalCount);
        if (error) {
          return error;
        }
      }
      return null;
  }
}

function text(tree: ConditionTree, signalName: (index: number) => string, top: boolean): string {
  let body: string;
  switch (tree.kind) {
    case 'compare': {
      if (tree.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS) {
        const until = t('condition.until', { value: formatValue(tree.closeBelow ?? 0) });
        body = `${signalName(tree.signal)} > ${formatValue(tree.value)} (${until})`;
        break;
      }
      const op = COMPARE_TYPES.find((c) => c.value === tree.type)?.label ?? '?';
      body = `${signalName(tree.signal)} ${op} ${formatValue(tree.value)}`;
      break;
    }
    case 'not':
      body = `${t('condition.not')} ${text(tree.child, signalName, false)}`;
      break;
    case 'group': {
      const joined = tree.children
        .map((child) => text(child, signalName, false))
        .join(` ${t(tree.op === 'and' ? 'condition.and' : 'condition.or')} `);
      body = top && tree.forMs === 0 ? joined : `(${joined})`;
      break;
    }
  }
  return tree.forMs > 0 ? `${body} ${t('condition.for', { ms: tree.forMs })}` : body;
}

function formatValue(value: number): string {
  return String(Number.parseFloat(value.toPrecision(7)));
}
