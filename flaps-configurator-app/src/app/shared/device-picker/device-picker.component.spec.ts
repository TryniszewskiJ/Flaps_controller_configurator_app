import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController } from '@ionic/angular';
import { BleLinkService } from '../../core/ble/ble-link.service';
import { DesktopBluetoothDevice } from '../../core/ble/desktop-bridge';
import { DesktopBluetoothService } from '../../core/ble/desktop-bluetooth.service';
import { DevicePickerComponent } from './device-picker.component';

describe('DevicePickerComponent (desktop)', () => {
  let fixture: ComponentFixture<DevicePickerComponent>;
  let emitDevices: (devices: DesktopBluetoothDevice[]) => void;
  const desktop = {
    onDevices: vi.fn((callback: (devices: DesktopBluetoothDevice[]) => void) => {
      emitDevices = callback;
      return vi.fn();
    }),
    selectDevice: vi.fn(),
    cancelSelection: vi.fn(),
  };
  const modalController = { dismiss: vi.fn(() => Promise.resolve(true)) };
  const link = { startScan: vi.fn(), stopScan: vi.fn(() => Promise.resolve()) };

  const rows = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.device-row'));

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: DesktopBluetoothService, useValue: desktop },
        { provide: ModalController, useValue: modalController },
        { provide: BleLinkService, useValue: link },
      ],
    });
    fixture = TestBed.createComponent(DevicePickerComponent);
    fixture.componentInstance.desktop = true;
    fixture.detectChanges();
  });

  it('lists devices reported by Electron instead of scanning itself', () => {
    emitDevices([{ deviceId: 'AA:BB', name: '' }]);
    fixture.detectChanges();

    expect(link.startScan).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Sterownik klap');
    expect(fixture.nativeElement.textContent).not.toContain('Szukaj ponownie');
  });

  it('passes the chosen device back to Electron', async () => {
    emitDevices([{ deviceId: 'AA:BB', name: 'DK_flaps_controller' }]);
    fixture.detectChanges();

    rows()[0].click();
    await fixture.whenStable();

    expect(desktop.selectDevice).toHaveBeenCalledWith('AA:BB');
    expect(modalController.dismiss).toHaveBeenCalledWith(
      { deviceId: 'AA:BB', name: 'DK_flaps_controller' },
      'select',
    );
  });

  it('cancels the Electron selection when closed without choosing', () => {
    fixture.destroy();

    expect(desktop.cancelSelection).toHaveBeenCalled();
  });

  it('does not cancel after a device was chosen', async () => {
    emitDevices([{ deviceId: 'AA:BB', name: 'X' }]);
    fixture.detectChanges();
    rows()[0].click();
    await fixture.whenStable();

    fixture.destroy();

    expect(desktop.cancelSelection).not.toHaveBeenCalled();
  });
});
