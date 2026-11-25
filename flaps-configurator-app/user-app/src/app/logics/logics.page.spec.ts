import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { clone, create } from '@bufbuild/protobuf';
import { ModalController } from '@ionic/angular';
import { ConnectionService } from '@flaps/core/connection.service';
import { FlapsState } from '@flaps/core/protocol/gen/flaps_common_pb';
import { FixedLogicSchema, LogicSchema } from '@flaps/core/protocol/gen/flaps_logic_pb';
import { defaultConfiguration } from '@flaps/core/testing/fake-device';
import { LogicsDraft, LogicsService } from '../core/logics.service';
import { LogicsPage } from './logics.page';

describe('LogicsPage', () => {
  let fixture: ComponentFixture<LogicsPage>;
  const draft = signal<LogicsDraft | null>(null);
  const selectorSignal = signal<number | undefined>(1);
  const dirty = signal(false);
  const setLogic = vi.fn();
  const apply = vi.fn(() => Promise.resolve(true));
  const save = vi.fn(() => Promise.resolve(true));
  const dismiss = { data: undefined as unknown, role: 'cancel' };
  const createModal = vi.fn((_options: unknown) =>
    Promise.resolve({
      present: (): Promise<void> => Promise.resolve(),
      onWillDismiss: (): Promise<typeof dismiss> => Promise.resolve(dismiss),
    }),
  );

  const text = (): string => fixture.nativeElement.textContent;
  const rows = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.list-button'));
  const buttonWith = (label: string): HTMLElement =>
    Array.from(
      fixture.nativeElement.querySelectorAll('ion-button') as NodeListOf<HTMLElement>,
    ).find((el) => el.textContent!.trim() === label)!;

  beforeEach(() => {
    vi.clearAllMocks();
    const config = defaultConfiguration();
    draft.set({ logics: config.logics, defaultLogicIndex: config.defaultLogicIndex });
    selectorSignal.set(1);
    dirty.set(false);
    dismiss.data = undefined;
    dismiss.role = 'cancel';

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            device: signal(null),
            status: signal('connected'),
            connected: signal(true),
            inBootloader: signal(false),
            application: signal(true),
            error: signal(null),
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal(null),
            protocolMinor: signal(15),
          },
        },
        {
          provide: LogicsService,
          useValue: {
            draft,
            busy: signal(null),
            error: signal(null),
            dirty,
            unsavedOnDevice: signal(false),
            selectorSignal,
            signals: computed(() => [{ name: 'RPM' }, { name: 'Drive mode' }]),
            setLogic,
            removeLogic: vi.fn(() => null),
            apply,
            save,
            read: vi.fn(() => Promise.resolve(true)),
            discard: vi.fn(),
          },
        },
        { provide: ModalController, useValue: { create: createModal } },
      ],
    });
    fixture = TestBed.createComponent(LogicsPage);
    fixture.detectChanges();
  });

  it('lists only the logics — no CAN frames, signals or settings', () => {
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Standard'),
      expect.stringContaining('Sport'),
    ]);
    expect(text()).not.toContain('Ramki CAN');
    expect(text()).not.toContain('Ustawienia');
    expect(text()).toContain('Tryb wybiera sygnał');
    expect(text()).toContain('Drive mode');
  });

  it('edits a logic in the logic editor with the signal names only', async () => {
    const edited = create(LogicSchema, {
      ...clone(LogicSchema, draft()!.logics[1]),
      description: 'Sport+',
      parameters: { case: 'fixed', value: create(FixedLogicSchema, { state: FlapsState.OPEN }) },
    });
    dismiss.data = edited;
    dismiss.role = 'save';

    rows()[1].click();
    await fixture.whenStable();

    const options = createModal.mock.calls[0][0] as { componentProps: Record<string, unknown> };
    expect(options.componentProps['index']).toBe(1);
    expect(options.componentProps['signals']).toEqual([{ name: 'RPM' }, { name: 'Drive mode' }]);
    expect(options.componentProps['selectorSignal']).toBe(1);
    expect(options.componentProps['lockName']).toBe(true);
    expect(options.componentProps['hideInput']).toBe(true);
    expect(setLogic).toHaveBeenCalledWith(1, edited);
  });

  it('saves the changes, with trying them as a secondary option', () => {
    // Wszystko zapisane — bez przycisków
    expect(buttonWith('Zapisz')).toBeUndefined();
    expect(text()).toContain('Wszystkie zmiany są zapisane');

    dirty.set(true);
    fixture.detectChanges();
    expect(text()).toContain('Masz niezapisane zmiany.');

    buttonWith('Wypróbuj bez zapisywania').click();
    buttonWith('Zapisz').click();

    expect(apply).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it('has no refresh button — the modes are read after connecting', () => {
    expect(buttonWith('Odśwież')).toBeUndefined();
    expect(buttonWith('Odczytaj')).toBeUndefined();
  });

  it('does not offer a new logic without a selector', () => {
    selectorSignal.set(undefined);
    draft.set({ logics: [draft()!.logics[0]], defaultLogicIndex: 0 });
    fixture.detectChanges();

    expect(buttonWith('+ Dodaj')).toBeUndefined();
    expect(text()).toContain('jeden tryb');
  });
});
