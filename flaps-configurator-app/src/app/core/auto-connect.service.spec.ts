import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { AutoConnectService } from './auto-connect.service';
import { BleLinkService, FoundDevice } from './ble/ble-link.service';
import { DesktopBluetoothService } from './ble/desktop-bluetooth.service';
import { ConnectionService } from './connection.service';
import { SettingsService } from './settings.service';
import { FakeBleLink } from './testing/fake-ble-link';

describe('AutoConnectService', () => {
  let link: FakeBleLink & {
    prepare: () => Promise<void>;
    requestDeviceInBrowser: () => Promise<FoundDevice>;
  };
  let desktop: {
    available: boolean;
    selectedId: string | null;
    autoSelect: ReturnType<typeof vi.fn>;
    cancelSelection: ReturnType<typeof vi.fn>;
  };
  let rejectRequest: (error: Error) => void;

  const remembered = { deviceId: 'AA:BB', name: 'Moje auto', uid: '0011' };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1);
    }
  };

  const setUp = (platform: 'native' | 'desktop' | 'browser'): void => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(platform === 'native');
    link = Object.assign(new FakeBleLink(), {
      prepare: vi.fn(() => Promise.resolve()),
      requestDeviceInBrowser: vi.fn(
        () =>
          new Promise<FoundDevice>((resolve, reject) => {
            rejectRequest = reject;
            // Electron wybiera zapamiętane urządzenie; Web Bluetooth zwraca własny (losowy) id
            if (
              desktop.autoSelect.mock.calls.length > 0 &&
              !desktop.cancelSelection.mock.calls.length
            ) {
              setTimeout(
                () => resolve({ deviceId: 'web-random-id', name: 'DK_flaps_controller' }),
                500,
              );
            }
          }),
      ),
    });
    desktop = {
      available: platform === 'desktop',
      selectedId: null,
      autoSelect: vi.fn((id: string) => {
        desktop.selectedId = id;
        return Promise.resolve();
      }),
      cancelSelection: vi.fn(() =>
        rejectRequest?.(new Error('User cancelled the requestDevice() chooser.')),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: BleLinkService, useValue: link },
        { provide: DesktopBluetoothService, useValue: desktop },
      ],
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('remembers the device after a successful connection', async () => {
    setUp('native');
    TestBed.inject(AutoConnectService);
    await TestBed.inject(ConnectionService).connect({ deviceId: 'AA:BB' });
    await settle();

    expect(TestBed.inject(SettingsService).lastDevice()).toEqual({
      deviceId: 'AA:BB',
      name: 'DK_flaps_controller',
      uid: expect.stringMatching(/^[0-9a-f]{24}$/),
    });
  });

  it('connects to the last device on start', async () => {
    setUp('native');
    const connect = vi.spyOn(link, 'connect');
    TestBed.inject(SettingsService).rememberDevice(remembered);

    TestBed.inject(AutoConnectService).start();
    await settle();

    expect(connect).toHaveBeenCalledWith('AA:BB', expect.any(Function), expect.any(Function));
    expect(TestBed.inject(ConnectionService).connected()).toBe(true);
  });

  it('waits for the user when automatic connection is off', async () => {
    setUp('native');
    const settings = TestBed.inject(SettingsService);
    settings.rememberDevice(remembered);
    settings.setAutoConnect(false);

    TestBed.inject(AutoConnectService).start();
    await settle();

    expect(link.connectCalls).toBe(0);
  });

  it('is not available in the browser', async () => {
    setUp('browser');
    const autoConnect = TestBed.inject(AutoConnectService);
    expect(autoConnect.supported).toBe(false);

    await TestBed.inject(ConnectionService).connect({ deviceId: 'web-random-id' });
    await settle();

    expect(TestBed.inject(SettingsService).lastDevice()).toBeNull();
  });

  it('lets Electron pick the remembered device and keeps its id', async () => {
    setUp('desktop');
    TestBed.inject(SettingsService).rememberDevice(remembered);
    const autoConnect = TestBed.inject(AutoConnectService);

    autoConnect.start();
    await settle();
    expect(autoConnect.searching()).toEqual(remembered);
    expect(desktop.autoSelect).toHaveBeenCalledWith('AA:BB');

    await vi.advanceTimersByTimeAsync(500);
    await settle();

    expect(autoConnect.searching()).toBeNull();
    expect(TestBed.inject(ConnectionService).connected()).toBe(true);
    // Nie losowy id z Web Bluetooth, tylko ten z okna wyboru Electrona
    expect(TestBed.inject(SettingsService).lastDevice()?.deviceId).toBe('AA:BB');
  });

  it('says when the remembered device is not around', async () => {
    setUp('desktop');
    // Zapamiętane urządzenie nie pojawia się w skanowaniu
    link.requestDeviceInBrowser = vi.fn(
      () => new Promise<FoundDevice>((_resolve, reject) => (rejectRequest = reject)),
    );
    TestBed.inject(SettingsService).rememberDevice(remembered);
    const autoConnect = TestBed.inject(AutoConnectService);

    autoConnect.start();
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();

    expect(autoConnect.searching()).toBeNull();
    expect(autoConnect.error()).toContain('Nie znaleziono sterownika „Moje auto”');
    expect(TestBed.inject(ConnectionService).status()).toBe('disconnected');
  });

  it('stops searching quietly when cancelled', async () => {
    setUp('desktop');
    link.requestDeviceInBrowser = vi.fn(
      () => new Promise<FoundDevice>((_resolve, reject) => (rejectRequest = reject)),
    );
    TestBed.inject(SettingsService).rememberDevice(remembered);
    const autoConnect = TestBed.inject(AutoConnectService);

    autoConnect.start();
    await settle();
    autoConnect.cancel();
    await settle();

    expect(desktop.cancelSelection).toHaveBeenCalled();
    expect(autoConnect.searching()).toBeNull();
    expect(autoConnect.error()).toBeNull();
  });
});
