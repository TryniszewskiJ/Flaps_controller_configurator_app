import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { Signal } from '../../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../../core/testing/fake-device';
import { SignalEditorComponent } from './signal-editor.component';

describe('SignalEditorComponent', () => {
  let fixture: ComponentFixture<SignalEditorComponent>;
  let element: HTMLElement;
  const dismiss = vi.fn((_data?: unknown, _role?: string) => Promise.resolve(true));

  /** Jak ModalController: componentProps przypisane przed ngOnInit. */
  const open = (index: number | null, frameIndex = 0): void => {
    const config = defaultConfiguration();
    fixture = TestBed.createComponent(SignalEditorComponent);
    Object.assign(fixture.componentInstance, {
      frames: config.frames,
      signals: config.signals,
      index,
      frameIndex,
    });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  };

  const cell = (bit: number): HTMLButtonElement =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('.bit')).find(
      (cell) => cell.querySelector('.bit-number')?.textContent === String(bit),
    )!;
  const selectedBits = (): number[] =>
    Array.from(element.querySelectorAll('.bit.selected'), (bit) =>
      Number(bit.querySelector('.bit-number')?.textContent),
    );
  const tap = (bit: number): void => {
    cell(bit).click();
    fixture.detectChanges();
  };
  const saveButton = (): HTMLElement =>
    Array.from(element.querySelectorAll('ion-button')).find(
      (b) => b.textContent?.trim() === 'Zapisz',
    )!;
  const saved = (): Signal => dismiss.mock.calls.at(-1)?.[0] as Signal;

  beforeEach(() => {
    dismiss.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: { dismiss } }],
    });
  });

  it('shows the edited signal in the bit grid', () => {
    open(0); // RPM: Motorola, bit 7, 16 b

    expect(selectedBits().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(cell(7).textContent).toContain('MSB');
    expect(cell(8).textContent).toContain('LSB');
  });

  it('hatches the other signals of the same frame only', () => {
    open(null, 1); // nowy sygnał w ramce 1 — tam jest Drive mode (bity 11–13), RPM w ramce 0

    expect(cell(12).classList).toContain('occupied');
    expect(cell(0).classList).not.toContain('occupied');
  });

  it('selects a Motorola range with two taps', async () => {
    open(1); // Drive mode

    tap(23);
    expect(selectedBits()).toEqual([23]);
    tap(17);
    expect(selectedBits().sort((a, b) => a - b)).toEqual([17, 18, 19, 20, 21, 22, 23]);

    saveButton().click();
    await fixture.whenStable();
    expect(dismiss).toHaveBeenCalledWith(expect.anything(), 'save');
    expect(saved()).toMatchObject({ startingBit: 23, lengthBits: 7, bigEndian: true });
  });

  it('selects an Intel range across bytes from the LSB', async () => {
    open(1);
    fixture.componentInstance['onByteOrder']('intel');

    tap(14);
    tap(17);
    fixture.detectChanges();

    expect(selectedBits().sort((a, b) => a - b)).toEqual([14, 15, 16, 17]);
    saveButton().click();
    await fixture.whenStable();
    expect(saved()).toMatchObject({ startingBit: 14, lengthBits: 4, bigEndian: false });
  });

  it('warns about overlapping signals and blocks a signal past the frame', () => {
    open(null);
    const editor = fixture.componentInstance;

    tap(3);
    expect(element.textContent).toContain('Nachodzi na: RPM');

    editor['onNumber']('start', '63');
    editor['onNumber']('length', '9');
    editor['onName']('Test');
    fixture.detectChanges();

    expect(element.textContent).toContain('nie mieści się');
    expect(editor['valid']()).toBe(false);
  });

  it("saves a signed signal and shows its two's complement range", async () => {
    open(1); // Drive mode: 3 b, skala 1
    fixture.componentInstance['onSigned']('signed');
    fixture.detectChanges();

    expect(element.textContent).toContain('-4 … 3');
    saveButton().click();
    await fixture.whenStable();
    expect(saved().isSigned).toBe(true);
  });

  it('keeps float32 values unchanged when nothing was edited', async () => {
    open(0);

    saveButton().click();
    await fixture.whenStable();

    expect(saved().scale).toBe(defaultConfiguration().signals[0].scale);
  });
});
