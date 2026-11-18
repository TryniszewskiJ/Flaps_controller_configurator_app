import { create } from '@bufbuild/protobuf';
import {
  ConditionTree,
  conditionError,
  conditionNodes,
  conditionSize,
  conditionText,
  conditionTree,
  conditionUsesHysteresis,
  conditionUsesSignal,
} from './condition';
import {
  ConditionNode,
  ConditionNodeSchema,
  ConditionNodeType as T,
} from './protocol/gen/flaps_pb';

const NAMES = ['RPM', 'pedał', 'tryb'];
const name = (i: number): string => NAMES[i] ?? '?';

// Przykład z README: (RPM > 4000 LUB pedał > 80 przez 300 ms) I NIE tryb == 2
const EXAMPLE: ConditionTree = {
  kind: 'group',
  op: 'and',
  forMs: 0,
  children: [
    {
      kind: 'group',
      op: 'or',
      forMs: 0,
      children: [
        { kind: 'compare', type: T.CONDITION_NODE_GREATER, signal: 0, value: 4000, forMs: 0 },
        { kind: 'compare', type: T.CONDITION_NODE_GREATER, signal: 1, value: 80, forMs: 300 },
      ],
    },
    {
      kind: 'not',
      forMs: 0,
      child: { kind: 'compare', type: T.CONDITION_NODE_EQUAL, signal: 2, value: 2, forMs: 0 },
    },
  ],
};

const compare = (signal: number, forMs = 0): ConditionTree => ({
  kind: 'compare',
  type: T.CONDITION_NODE_LESS,
  signal,
  value: 1,
  forMs,
});

describe('condition', () => {
  it('writes the tree in postfix order like the README example', () => {
    const nodes = conditionNodes(EXAMPLE);

    expect(nodes.map((n) => [n.type, n.signal, n.value, n.operands, n.forMs])).toEqual([
      [T.CONDITION_NODE_GREATER, 0, 4000, 0, 0],
      [T.CONDITION_NODE_GREATER, 1, 80, 0, 300],
      [T.CONDITION_NODE_OR, 0, 0, 2, 0],
      [T.CONDITION_NODE_EQUAL, 2, 2, 0, 0],
      [T.CONDITION_NODE_NOT, 0, 0, 0, 0],
      [T.CONDITION_NODE_AND, 0, 0, 2, 0],
    ]);
    expect(conditionTree(nodes)).toEqual(EXAMPLE);
  });

  it('describes the condition in one line', () => {
    expect(conditionText(EXAMPLE, name)).toBe(
      '(RPM > 4000 LUB pedał > 80 przez 300 ms) I NIE tryb = 2',
    );
  });

  it('rejects postfix lists that are not one tree', () => {
    const node = (type: T, operands = 0): ConditionNode =>
      create(ConditionNodeSchema, { type, operands });

    expect(conditionTree([])).toBeNull();
    expect(conditionTree([node(T.CONDITION_NODE_GREATER), node(T.CONDITION_NODE_LESS)])).toBeNull();
    expect(
      conditionTree([node(T.CONDITION_NODE_GREATER), node(T.CONDITION_NODE_AND, 2)]),
    ).toBeNull();
    expect(conditionTree([node(T.CONDITION_NODE_NOT)])).toBeNull();
    expect(conditionTree([node(T.CONDITION_NODE_UNSPECIFIED)])).toBeNull();
  });

  it('turns a group with one condition into the condition and adds up the times', () => {
    const tree: ConditionTree = {
      kind: 'group',
      op: 'or',
      forMs: 200,
      children: [compare(0, 100)],
    };

    expect(conditionNodes(tree)).toMatchObject([{ type: T.CONDITION_NODE_LESS, forMs: 300 }]);
    expect(conditionSize(tree)).toBe(1);
  });

  it('validates like the firmware', () => {
    const group = (children: ConditionTree[]): ConditionTree => ({
      kind: 'group',
      op: 'and',
      forMs: 0,
      children,
    });

    expect(conditionError(EXAMPLE, 3)).toBeNull();
    expect(conditionError(group([]), 3)).toContain('co najmniej jedno');
    expect(conditionError(EXAMPLE, 2)).toContain('bez sygnału');
    expect(conditionError(compare(0, 60_001), 3)).toContain('od 0 do 60000');
    expect(
      conditionError(
        { kind: 'compare', type: T.CONDITION_NODE_LESS, signal: 0, value: NaN, forMs: 0 },
        3,
      ),
    ).toContain('liczbą');
    // 12 porównań + I = 13 węzłów
    expect(conditionError(group(Array.from({ length: 12 }, () => compare(0))), 3)).toContain(
      'najwyżej 12',
    );
    expect(conditionError(group(Array.from({ length: 11 }, () => compare(0))), 3)).toBeNull();
  });

  describe('hysteresis node', () => {
    // tryb = 1 I histereza RPM 4000 / 3500 — przykład z CHANGELOG
    const HYSTERESIS: ConditionTree = {
      kind: 'group',
      op: 'and',
      forMs: 0,
      children: [
        { kind: 'compare', type: T.CONDITION_NODE_EQUAL, signal: 2, value: 1, forMs: 0 },
        {
          kind: 'compare',
          type: T.CONDITION_NODE_HYSTERESIS,
          signal: 0,
          value: 4000,
          closeBelow: 3500,
          forMs: 0,
        },
      ],
    };

    it('keeps both thresholds through the postfix list', () => {
      const nodes = conditionNodes(HYSTERESIS);

      expect(nodes[1]).toMatchObject({
        type: T.CONDITION_NODE_HYSTERESIS,
        signal: 0,
        value: 4000,
        closeBelow: 3500,
      });
      expect(nodes[0].closeBelow).toBe(0);
      expect(conditionTree(nodes)).toEqual(HYSTERESIS);
      expect(conditionUsesSignal(nodes, 0)).toBe(true);
      expect(conditionUsesHysteresis(HYSTERESIS)).toBe(true);
      expect(conditionUsesHysteresis(EXAMPLE)).toBe(false);
    });

    it('describes and validates the thresholds', () => {
      expect(conditionText(HYSTERESIS, name)).toBe('tryb = 1 I RPM > 4000 (do < 3500)');
      expect(conditionError(HYSTERESIS, 3)).toBeNull();

      const node = (closeBelow: number): ConditionTree => ({
        kind: 'compare',
        type: T.CONDITION_NODE_HYSTERESIS,
        signal: 0,
        value: 4000,
        closeBelow,
        forMs: 0,
      });
      expect(conditionError(node(4000), 3)).toBeNull(); // bez pasma
      expect(conditionError(node(4500), 3)).toContain('nie może być wyżej');
      expect(conditionError(node(NaN), 3)).toContain('musi być liczbą');
    });
  });

  it('finds the signals used in comparisons', () => {
    const nodes = conditionNodes(EXAMPLE);

    expect(conditionUsesSignal(nodes, 2)).toBe(true);
    expect(conditionUsesSignal(nodes, 3)).toBe(false);
  });
});
