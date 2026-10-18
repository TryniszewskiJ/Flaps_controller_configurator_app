import { TestBed } from '@angular/core/testing';
import { ConnectionService } from './connection.service';

describe('ConnectionService', () => {
  let service: ConnectionService;

  beforeEach(() => {
    service = TestBed.inject(ConnectionService);
  });

  it('starts disconnected', () => {
    expect(service.connected()).toBe(false);
    expect(service.deviceName()).toBeNull();
  });

  it('connects and disconnects', async () => {
    await service.connect();
    expect(service.connected()).toBe(true);
    expect(service.deviceName()).not.toBeNull();

    service.disconnect();
    expect(service.connected()).toBe(false);
    expect(service.deviceName()).toBeNull();
  });
});
