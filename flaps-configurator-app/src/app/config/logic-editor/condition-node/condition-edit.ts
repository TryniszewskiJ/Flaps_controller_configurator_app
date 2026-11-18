import { CompareType, ConditionTree } from '../../../core/condition';
import { ConditionNodeType } from '../../../core/protocol/gen/flaps_pb';
import { parseInteger, parseNumber, roundFloat } from '../../config-format';

/**
 * Element warunku w edytorze: pola liczbowe jako tekst (wpisywane „-” albo „0.” nie może
 * zniknąć), `id` utrzymuje ten sam element widoku przy zmianach.
 */
export type EditNode =
  | {
      id: number;
      kind: 'compare';
      type: CompareType;
      signal: number | null;
      valueText: string;
      /** Histereza: próg wyłączenia. */
      closeText: string;
      forText: string;
    }
  | { id: number; kind: 'group'; op: 'and' | 'or'; children: EditNode[]; forText: string }
  | { id: number; kind: 'not'; child: EditNode; forText: string };

let nextId = 0;

export function newCompare(signal: number | null): EditNode {
  return {
    id: nextId++,
    kind: 'compare',
    type: ConditionNodeType.CONDITION_NODE_GREATER,
    signal,
    valueText: '0',
    closeText: '0',
    forText: '',
  };
}

export function newGroup(op: 'and' | 'or', children: EditNode[]): EditNode {
  return { id: nextId++, kind: 'group', op, children, forText: '' };
}

export function negate(node: EditNode): EditNode {
  return { id: nextId++, kind: 'not', child: node, forText: '' };
}

/** Do edycji; korzeń zawsze jest grupą, żeby było gdzie dodawać warunki. */
export function editRoot(tree: ConditionTree): EditNode {
  const node = editNode(tree);
  return node.kind === 'group' ? node : newGroup('and', [node]);
}

/** Drzewo z edytora; niepoprawne pola jako NaN (wyłapie je conditionError). */
export function conditionFromEdit(node: EditNode): ConditionTree {
  const forMs = node.forText.trim() === '' ? 0 : parseInteger(node.forText);
  switch (node.kind) {
    case 'compare':
      return {
        kind: 'compare',
        type: node.type,
        signal: node.signal ?? Number.MAX_SAFE_INTEGER,
        value: parseNumber(node.valueText),
        ...(node.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS && {
          closeBelow: parseNumber(node.closeText),
        }),
        forMs,
      };
    case 'group':
      return { kind: 'group', op: node.op, children: node.children.map(conditionFromEdit), forMs };
    case 'not':
      return { kind: 'not', child: conditionFromEdit(node.child), forMs };
  }
}

function editNode(tree: ConditionTree): EditNode {
  const forText = tree.forMs > 0 ? String(tree.forMs) : '';
  switch (tree.kind) {
    case 'compare':
      return {
        id: nextId++,
        kind: 'compare',
        type: tree.type,
        signal: tree.signal,
        valueText: String(roundFloat(tree.value)),
        closeText: String(roundFloat(tree.closeBelow ?? tree.value)),
        forText,
      };
    case 'group':
      return {
        id: nextId++,
        kind: 'group',
        op: tree.op,
        children: tree.children.map(editNode),
        forText,
      };
    case 'not':
      return { id: nextId++, kind: 'not', child: editNode(tree.child), forText };
  }
}
