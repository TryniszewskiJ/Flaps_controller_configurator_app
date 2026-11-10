import { ComponentFixture, TestBed } from '@angular/core/testing';
import { create } from '@bufbuild/protobuf';
import { ModalController } from '@ionic/angular';
import { ConfigurationSettings, configurationSettings } from '../../core/configuration.service';
import { FlapsState, LogicSchema } from '../../core/protocol/gen/flaps_pb';
import { defaultConfiguration } from '../../core/testing/fake-device';
import { SettingsEditorComponent } from './settings-editor.component';

describe('SettingsEditorComponent', () => {
  let fixture: ComponentFixture<SettingsEditorComponent>;
  let editor: SettingsEditorComponent;
  const dismiss = vi.fn((_data?: unknown, _role?: string) => Promise.resolve(true));

  const open = (config = defaultConfiguration()): void => {
    fixture = TestBed.createComponent(SettingsEditorComponent);
    editor = fixture.componentInstance;
    Object.assign(editor, {
      signals: config.signals,
      logics: config.logics,
      settings: configurationSettings(config),
    });
    fixture.detectChanges();
  };

  const save = async (): Promise<ConfigurationSettings> => {
    await editor['save']();
    return dismiss.mock.calls.at(-1)?.[0] as ConfigurationSettings;
  };

  beforeEach(() => {
    dismiss.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: ModalController, useValue: { dismiss } }],
    });
  });

  it('returns the edited settings', async () => {
    open();
    editor['onFailSafe']('open');
    editor['onMoveTime']('400');
    editor['termination'].set(true);
    editor['setFlapOutput'](2, { reversed: true });
    editor['demoMode'].set(true);

    expect(await save()).toEqual({
      selectorSignal: 1,
      defaultLogicIndex: 0,
      failSafeState: FlapsState.OPEN,
      moveTimeMs: 400,
      fdcanTermination: true,
      flap1: { connected: true, reversed: false },
      flap2: { connected: true, reversed: true },
      demoMode: true,
    });
  });

  it('requires at least one connected flap', () => {
    open();
    editor['setFlapOutput'](1, { connected: false });
    expect(editor['valid']()).toBe(true);

    editor['setFlapOutput'](2, { connected: false });
    expect(editor['flapsError']()).toContain('Co najmniej jedna');
    expect(editor['valid']()).toBe(false);
  });

  it('requires a selector for several logics', () => {
    open();
    editor['onSelector'](-1);

    expect(editor['selectorError']()).toContain('Kilka logik');
    expect(editor['valid']()).toBe(false);
  });

  it('rejects a selector when logics share a selector value', () => {
    const config = defaultConfiguration();
    config.selectorSignal = undefined;
    config.logics = [
      create(LogicSchema, { ...config.logics[0], selectorValue: 0 }),
      create(LogicSchema, { ...config.logics[1], selectorValue: 0 }),
    ];
    open(config);
    editor['onSelector'](1);

    expect(editor['selectorError']()).toContain('„Standard” i „Sport”');
  });

  it('checks the move time range', () => {
    open();
    editor['onMoveTime']('49');
    expect(editor['moveTimeError']()).toContain('50');
    editor['onMoveTime']('5000');
    expect(editor['moveTimeError']()).toBeNull();
  });
});
