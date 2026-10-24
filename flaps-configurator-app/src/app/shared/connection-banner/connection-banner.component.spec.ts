import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService, ConnectionStatus } from '../../core/connection.service';
import { ConnectionBannerComponent } from './connection-banner.component';

describe('ConnectionBannerComponent', () => {
  let fixture: ComponentFixture<ConnectionBannerComponent>;
  const status = signal<ConnectionStatus>('disconnected');
  const error = signal<string | null>(null);

  const banner = (): HTMLElement => fixture.nativeElement.querySelector('.banner');

  beforeEach(() => {
    status.set('disconnected');
    error.set(null);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            status,
            error,
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal({ firmwareVersion: '1.2.3', uid: '' }),
            connect: vi.fn(),
            disconnect: vi.fn(() => Promise.resolve()),
          },
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
});
