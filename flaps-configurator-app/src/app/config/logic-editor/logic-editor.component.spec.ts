import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { FlapsState, Logic } from '../../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../../core/testing/fake-device';
import { LogicEditorComponent } from './logic-editor.component';

describe('LogicEditorComponent', () => {
  let fixture: ComponentFixture<LogicEditorComponent>;
  let editor: LogicEditorComponent;
  const dismiss = vi.fn((_data?: unknown, _role?: string) => Promise.resolve(true));

  /** Jak ModalController: componentProps przypisane przed ngOnInit. */
  /** Bez opcji — selektor Drive mode jak w konfiguracji domyślnej. */
  const open = (
    index: number | null,
    { selectorSignal }: { selectorSignal?: number } = { selectorSignal: 1 },
  ): void => {
    const config = defaultConfiguration();
    fixture = TestBed.createComponent(LogicEditorComponent);
    editor = fixture.componentInstance;
    Object.assign(editor, {
      logics: config.logics,
      signals: config.signals,
      index,
      selectorSignal,
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

  it('hides the selector value without a selector signal', () => {
    open(0, {});
    editor['onText']('selector', 'x');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Wartość selektora');
    expect(editor['valid']()).toBe(true);
  });
});
