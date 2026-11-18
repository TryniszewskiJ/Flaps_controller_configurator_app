import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { create } from '@bufbuild/protobuf';
import { conditionNodes } from '../../core/condition';
import {
  ConditionNodeType as T,
  FlapsState,
  Logic,
  LogicSchema,
} from '../../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../../core/testing/fake-device';
import { EditNode } from './condition-node/condition-edit';
import { LogicEditorComponent } from './logic-editor.component';

describe('LogicEditorComponent', () => {
  let fixture: ComponentFixture<LogicEditorComponent>;
  let editor: LogicEditorComponent;
  const dismiss = vi.fn((_data?: unknown, _role?: string) => Promise.resolve(true));

  /** Jak ModalController: componentProps przypisane przed ngOnInit. */
  /** Bez opcji — selektor Drive mode jak w konfiguracji domyślnej. */
  const open = (
    index: number | null,
    {
      selectorSignal,
      logics,
      protocolMinor = 13,
    }: { selectorSignal?: number; logics?: Logic[]; protocolMinor?: number } = {
      selectorSignal: 1,
    },
  ): void => {
    const config = defaultConfiguration();
    if (logics) {
      config.logics = logics;
    }
    fixture = TestBed.createComponent(LogicEditorComponent);
    editor = fixture.componentInstance;
    Object.assign(editor, {
      logics: config.logics,
      signals: config.signals,
      index,
      selectorSignal,
      protocolMinor,
    });
    fixture.detectChanges();
  };

  const save = async (): Promise<Logic> => {
    await editor['save']();
    return dismiss.mock.calls.at(-1)?.[0] as Logic;
  };

  beforeEach(() => {
    dismiss.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: { dismiss } }],
    });
  });

  it('keeps an unedited hysteresis logic unchanged', async () => {
    open(1); // Sport: RPM > 500 otwórz, < 300 zamknij

    expect(await save()).toEqual(defaultConfiguration().logics[1]);
  });

  it('suggests the next selector value and a non-selector input for a new logic', async () => {
    open(null);

    expect(editor['selectorText']()).toBe('2');
    expect(editor['input']()).toBe(0); // RPM, nie Drive mode (selektor)

    editor['onText']('description', 'Track');
    editor['onType']('simpleSwitch');
    editor['onText']('openValue', '-3');
    editor['onText']('closeValue', '7');
    expect(await save()).toMatchObject({
      selectorValue: 2,
      description: 'Track',
      inputSignal: 0,
      parameters: { case: 'simpleSwitch', value: { openValue: -3, closeValue: 7 } },
    });
  });

  it('saves a fixed logic without an input signal', async () => {
    open(0);
    editor['onType']('fixed');
    editor['onFixedState']('open');

    const logic = await save();
    expect(logic.inputSignal).toBeUndefined();
    expect(logic.parameters).toMatchObject({ case: 'fixed', value: { state: FlapsState.OPEN } });
  });

  it('rejects a duplicate selector value and wrong parameters', () => {
    open(0);
    const element = fixture.nativeElement as HTMLElement;

    editor['onText']('selector', '1');
    fixture.detectChanges();
    expect(element.textContent).toContain('„Sport”');
    expect(editor['valid']()).toBe(false);

    editor['onText']('selector', '0');
    editor['onText']('closeBelow', '5000'); // powyżej progu otwarcia 4000
    fixture.detectChanges();
    expect(element.textContent).toContain('nie może być wyżej');
    expect(editor['valid']()).toBe(false);

    editor['onType']('simpleSwitch');
    editor['onText']('openValue', '2');
    editor['onText']('closeValue', '2');
    expect(editor['parametersError']()).toContain('różnić');
  });

  describe('condition', () => {
    // RPM > 4000 I Drive mode = 2 przez 500 ms
    const CONDITION = create(LogicSchema, {
      description: 'Warunek',
      parameters: {
        case: 'condition',
        value: {
          nodes: conditionNodes({
            kind: 'group',
            op: 'and',
            forMs: 0,
            children: [
              { kind: 'compare', type: T.CONDITION_NODE_GREATER, signal: 0, value: 4000, forMs: 0 },
              { kind: 'compare', type: T.CONDITION_NODE_EQUAL, signal: 1, value: 2, forMs: 500 },
            ],
          }),
        },
      },
    });

    it('keeps an unedited condition unchanged', async () => {
      open(0, { logics: [CONDITION] });

      expect(editor['type']()).toBe('condition');
      expect(fixture.nativeElement.querySelectorAll('app-condition-node')).toHaveLength(3);
      expect(await save()).toEqual(CONDITION);
    });

    it('builds a new condition without an input signal', async () => {
      open(null);
      editor['onType']('condition');
      fixture.detectChanges();
      expect(editor['valid']()).toBe(true); // RPM > 0

      // Druga gałąź: LUB z dwóch porównań
      const root = editor['condition']() as Extract<EditNode, { kind: 'group' }>;
      editor['condition'].set({
        ...root,
        children: [
          { ...root.children[0], valueText: '4000' } as EditNode,
          {
            id: 1000,
            kind: 'group',
            op: 'or',
            forText: '200',
            children: [
              {
                id: 1001,
                kind: 'compare',
                type: T.CONDITION_NODE_LESS,
                signal: 1,
                valueText: '1',
                closeText: '',
                forText: '',
              },
              {
                id: 1002,
                kind: 'compare',
                type: T.CONDITION_NODE_GREATER,
                signal: 1,
                valueText: '2,5',
                closeText: '',
                forText: '',
              },
            ],
          },
        ],
      });

      const logic = await save();
      expect(logic.inputSignal).toBeUndefined();
      expect(logic.parameters.case).toBe('condition');
      const nodes = logic.parameters.case === 'condition' ? logic.parameters.value.nodes : [];
      expect(nodes.map((n) => [n.type, n.value, n.operands, n.forMs])).toEqual([
        [T.CONDITION_NODE_GREATER, 4000, 0, 0],
        [T.CONDITION_NODE_LESS, 1, 0, 0],
        [T.CONDITION_NODE_GREATER, 2.5, 0, 0],
        [T.CONDITION_NODE_OR, 0, 2, 200],
        [T.CONDITION_NODE_AND, 0, 2, 0],
      ]);
    });

    it('shows condition errors and refuses an older device', () => {
      open(null);
      editor['onType']('condition');
      const root = editor['condition']() as Extract<EditNode, { kind: 'group' }>;
      editor['condition'].set({ ...root, children: [] });
      expect(editor['parametersError']()).toContain('co najmniej jedno');

      open(null, { selectorSignal: 1, protocolMinor: 11 });
      editor['onType']('condition');
      expect(editor['parametersError']()).toContain('1.12');
      expect(editor['valid']()).toBe(false);
    });

    it('saves a hysteresis node and refuses it on a 1.12 device', async () => {
      open(null, { selectorSignal: 1, protocolMinor: 12 });
      editor['onType']('condition');
      const root = editor['condition']() as Extract<EditNode, { kind: 'group' }>;
      editor['condition'].set({
        ...root,
        children: [
          {
            ...(root.children[0] as Extract<EditNode, { kind: 'compare' }>),
            type: T.CONDITION_NODE_HYSTERESIS,
            valueText: '4000',
            closeText: '3500',
          },
        ],
      });
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('ion-input[aria-label="Wyłącz poniżej"]'),
      ).not.toBeNull();
      expect(editor['parametersError']()).toContain('1.13');

      editor.protocolMinor = 13;
      editor['condition'].set({ ...editor['condition']() });
      const logic = await save();
      const nodes = logic.parameters.case === 'condition' ? logic.parameters.value.nodes : [];
      expect(nodes).toMatchObject([
        { type: T.CONDITION_NODE_HYSTERESIS, signal: 0, value: 4000, closeBelow: 3500 },
      ]);
    });
  });

  it('hides the selector value without a selector signal', () => {
    open(0, {});
    editor['onText']('selector', 'x');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Wartość selektora');
    expect(editor['valid']()).toBe(true);
  });
});
