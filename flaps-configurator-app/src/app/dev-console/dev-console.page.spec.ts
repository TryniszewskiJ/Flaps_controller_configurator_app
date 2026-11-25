import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService, ConnectionStatus } from '../core/connection.service';
import { DevConsolePage } from './dev-console.page';

describe('DevConsolePage', () => {
  let fixture: ComponentFixture<DevConsolePage>;
  const status = signal<ConnectionStatus>('connected');

  beforeEach(() => {
    status.set('connected');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            device: signal(null),
            status,
            connected: computed(() => status() === 'connected'),
            inBootloader: signal(false),
            application: computed(() => status() === 'connected'),
            error: signal(null),
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal(null),
            session: signal(0),
            onUnsolicited: () => (): void => undefined,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(DevConsolePage);
    fixture.detectChanges();
  });

  it('shows all developer cards', () => {
    for (const card of [
      'app-command-card',
      'app-amp-out-card',
      'app-device-log-card',
      'app-frame-log-card',
    ]) {
      expect(fixture.nativeElement.querySelector(card)).not.toBeNull();
    }
  });
});
