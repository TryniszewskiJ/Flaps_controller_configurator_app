import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  // Capacitor Preferences w przeglądarce (i w testach) zapisuje do localStorage
  const STORED_KEY = 'CapacitorStorage.flaps.settings';
  const device = { deviceId: 'AA:BB:CC:DD:EE:FF', name: 'DK_flaps_controller', uid: 'a1b2c3' };

  beforeEach(() => localStorage.clear());

  /** Jak przy ponownym uruchomieniu aplikacji: nowa instancja wczytuje zapisane ustawienia. */
  const restart = async (): Promise<SettingsService> => {
    await TestBed.inject(SettingsService).flush();
    TestBed.resetTestingModule();
    const settings = TestBed.inject(SettingsService);
    await settings.load();
    return settings;
  };

  it('uses the defaults on the first start', async () => {
    const settings = TestBed.inject(SettingsService);
    await settings.load();
    expect(settings.settings()).toEqual(DEFAULT_SETTINGS);
    expect(settings.autoConnect()).toBe(true);
  });

  it('keeps the settings after a restart', async () => {
    const settings = TestBed.inject(SettingsService);
    await settings.load();
    settings.setLanguage('en');
    settings.setTheme('light');
    settings.setAutoConnect(false);
    settings.rememberDevice(device);

    const restarted = await restart();

    expect(restarted.language()).toBe('en');
    expect(restarted.theme()).toBe('light');
    expect(restarted.autoConnect()).toBe(false);
    expect(restarted.lastDevice()).toEqual(device);
    expect(JSON.parse(localStorage.getItem(STORED_KEY)!)).toMatchObject({ theme: 'light' });
  });

  it('forgets the last device', async () => {
    const settings = TestBed.inject(SettingsService);
    settings.rememberDevice(device);
    settings.forgetDevice();

    expect((await restart()).lastDevice()).toBeNull();
  });

  it('takes over the theme saved by the old header toggle', async () => {
    localStorage.setItem('flaps.theme', 'dark');
    const settings = TestBed.inject(SettingsService);
    await settings.load();
    expect(settings.theme()).toBe('dark');
  });

  it('falls back to the defaults for a damaged entry', async () => {
    localStorage.setItem(STORED_KEY, '{"theme":"neon","autoConnect":"yes","lastDevice":{}}');
    const settings = TestBed.inject(SettingsService);
    await settings.load();
    expect(settings.settings()).toEqual(DEFAULT_SETTINGS);

    localStorage.setItem(STORED_KEY, 'not json');
    await settings.load();
    expect(settings.settings()).toEqual(DEFAULT_SETTINGS);
  });
});
