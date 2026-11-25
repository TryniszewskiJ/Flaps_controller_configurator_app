import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AutoConnectService } from '../../core/auto-connect.service';
import { ConnectionService } from '../../core/connection.service';
import { SettingsService } from '../../core/settings.service';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let settings: SettingsService;
  const supported = { value: true };

  const text = (): string => fixture.nativeElement.textContent;
  const toggle = (): HTMLIonToggleElement => fixture.nativeElement.querySelector('ion-toggle');

  const create = (): void => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            device: signal(null),
            status: signal('disconnected'),
            error: signal(null),
            deviceName: signal(null),
            deviceInfo: signal(null),
            inBootloader: signal(false),
          },
        },
        {
          provide: AutoConnectService,
          useValue: {
            supported: supported.value,
            searching: signal(null),
            error: signal(null),
            cancel: vi.fn(),
          },
        },
      ],
    });
    settings = TestBed.inject(SettingsService);
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    supported.value = true;
  });

  it('changes the theme', () => {
    create();
    const segment = fixture.nativeElement.querySelector('ion-segment') as HTMLIonSegmentElement;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'dark' } }));

    expect(settings.theme()).toBe('dark');
  });

  it('turns automatic connection off and forgets the last device', () => {
    create();
    settings.rememberDevice({ deviceId: 'AA:BB', name: 'Moje auto', uid: '00112233aabbccdd' });
    fixture.detectChanges();
    expect(text()).toContain('Moje auto');
    expect(text()).toContain('UID 00112233 aabbccdd');

    toggle().dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false } }));
    expect(settings.autoConnect()).toBe(false);

    (fixture.nativeElement.querySelector('.link-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(settings.lastDevice()).toBeNull();
    expect(text()).toContain('Brak zapamiętanego sterownika');
  });

  it('explains that the browser cannot connect automatically', () => {
    supported.value = false;
    create();

    expect(toggle().disabled).toBe(true);
    expect(text()).toContain('Niedostępne w przeglądarce');
    expect(text()).not.toContain('Ostatni sterownik');
  });
});
