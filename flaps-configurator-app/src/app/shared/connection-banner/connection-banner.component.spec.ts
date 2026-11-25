import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AutoConnectService } from '../../core/auto-connect.service';
import { ConnectionService, ConnectionStatus, DeviceInfo } from '../../core/connection.service';
import { RememberedDevice } from '../../core/settings.service';
import { BootloaderReason } from '../../core/protocol/messages';
import { ConnectionBannerComponent } from './connection-banner.component';

describe('ConnectionBannerComponent', () => {
  let fixture: ComponentFixture<ConnectionBannerComponent>;
  const status = signal<ConnectionStatus>('disconnected');
  const error = signal<string | null>(null);
  const deviceInfo = signal<DeviceInfo | null>(null);
  const searching = signal<RememberedDevice | null>(null);
  const autoError = signal<string | null>(null);
  const cancelSearch = vi.fn();

  const banner = (): HTMLElement => fixture.nativeElement.querySelector('.banner');

  beforeEach(() => {
    status.set('disconnected');
    error.set(null);
    searching.set(null);
    autoError.set(null);
    deviceInfo.set({
      firmwareVersion: '1.2.3',
      uid: '',
      mode: 'application',
      bootloaderReason: BootloaderReason.UNSPECIFIED,
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            device: signal(null),
            status,
            error,
            deviceName: signal('DK_flaps_controller'),
            deviceInfo,
            inBootloader: computed(() => deviceInfo()?.mode === 'bootloader'),
            connect: vi.fn(),
            disconnect: vi.fn(() => Promise.resolve()),
          },
        },
        {
          provide: AutoConnectService,
          useValue: { searching, error: autoError, cancel: cancelSearch },
        },
      ],
    });
    fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();
  });

  it('shows the disconnected banner by default', () => {
    expect(banner().classList).toContain('banner--disconnected');
    expect(banner().textContent).toContain('Połącz');
  });

  it('shows the last connection error', () => {
    error.set('Urządzenie nie odpowiada.');
    fixture.detectChanges();

    expect(banner().textContent).toContain('Urządzenie nie odpowiada.');
  });

  it('shows the search for the last device and cancels it', () => {
    searching.set({ deviceId: 'AA:BB', name: 'Moje auto', uid: '' });
    fixture.detectChanges();

    expect(banner().classList).toContain('banner--pending');
    expect(banner().textContent).toContain('Szukam sterownika Moje auto');
    (banner().querySelector('ion-button') as HTMLElement).click();
    expect(cancelSearch).toHaveBeenCalled();
  });

  it('says when the last device was not found', () => {
    autoError.set('Nie znaleziono sterownika „Moje auto”');
    fixture.detectChanges();

    expect(banner().classList).toContain('banner--disconnected');
    expect(banner().textContent).toContain('Nie znaleziono sterownika');
  });

  it('shows the connecting banner', () => {
    status.set('connecting');
    fixture.detectChanges();

    expect(banner().classList).toContain('banner--pending');
    expect(banner().textContent).toContain('Anuluj');
  });

  it('shows the reconnecting banner', () => {
    status.set('reconnecting');
    fixture.detectChanges();

    expect(banner().textContent).toContain('Utracono połączenie');
  });

  it('shows the connected banner with the device name and firmware', () => {
    status.set('connected');
    fixture.detectChanges();

    expect(banner().classList).toContain('banner--connected');
    expect(banner().textContent).toContain('DK_flaps_controller');
    expect(banner().textContent).toContain('FW 1.2.3');
  });

  it('warns that a device in the bootloader does not control the flaps', () => {
    status.set('connected');
    deviceInfo.set({ ...deviceInfo()!, mode: 'bootloader' });
    fixture.detectChanges();

    expect(banner().textContent).toContain('tryb ratunkowy');
    expect(fixture.nativeElement.querySelector('.bootloader-notice')?.textContent).toContain(
      'Tryb ratunkowy',
    );
  });
});
