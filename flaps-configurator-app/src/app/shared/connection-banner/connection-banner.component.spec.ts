import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService } from '../../core/connection.service';
import { ConnectionBannerComponent } from './connection-banner.component';

describe('ConnectionBannerComponent', () => {
  let fixture: ComponentFixture<ConnectionBannerComponent>;
  let connection: ConnectionService;

  beforeEach(() => {
    fixture = TestBed.createComponent(ConnectionBannerComponent);
    connection = TestBed.inject(ConnectionService);
    fixture.detectChanges();
  });

  it('shows the disconnected banner by default', () => {
    expect(fixture.nativeElement.querySelector('.banner--disconnected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.banner--connected')).toBeNull();
  });

  it('shows the connected banner with the device name', async () => {
    await connection.connect();
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('.banner--connected');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(connection.deviceName());
  });
});
