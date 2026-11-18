import { create } from '@bufbuild/protobuf';
import {
  ConditionNodeType,
  ConfigurationSchema,
  FlapStopMode,
  LogicSchema,
} from '../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../core/testing/fake-device';
import { logicSummary, stopModeLabel } from './config-format';

describe('stopModeLabel', () => {
  it('shows the move time without a stop mode (device < 1.11)', () => {
    expect(stopModeLabel(create(ConfigurationSchema, { moveTimeMs: 250 }))).toBe('po 250 ms');
  });

  it('shows the end stop detection with defaults for missing values', () => {
    const config = create(ConfigurationSchema, {
      moveTimeMs: 250,
      stopMode: FlapStopMode.END_STOP,
      endStop: { threshold: 20_000 },
    });
    expect(stopModeLabel(config)).toBe('ogranicznik: próg 20000 (1007.1 mV) · limit 1000 ms');
  });
});

describe('logicSummary', () => {
  it('describes a condition logic', () => {
    const signals = defaultConfiguration().signals;
    const logic = create(LogicSchema, {
      parameters: {
        case: 'condition',
        value: {
          nodes: [
            { type: ConditionNodeType.CONDITION_NODE_GREATER, signal: 0, value: 4000 },
            { type: ConditionNodeType.CONDITION_NODE_NOT_EQUAL, signal: 1, value: 2, forMs: 300 },
            { type: ConditionNodeType.CONDITION_NODE_OR, operands: 2 },
          ],
        },
      },
    });
    expect(logicSummary(logic, signals)).toBe(
      'Otwórz, gdy RPM > 4000 LUB Drive mode ≠ 2 przez 300 ms',
    );
  });
});
