import { computed, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService, ConnectionStatus } from '../core/connection.service';
import { FrameLogService } from '../core/frame-log.service';
import { Command } from '../core/protocol/gen/flaps_pb';
import { DevConsolePage } from './dev-console.page';

// Dostęp do chronionych składowych strony na potrzeby testu
interface DevConsoleApi {
  command: WritableSignal<string>;
  send(): Promise<void>;
  onFilterChange(value: number[]): void;
}

const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.split(/\s+/).map((byte) => parseInt(byte, 16)));

describe('DevConsolePage', () => {
  let fixture: ComponentFixture<DevConsolePage>;
  let page: DevConsoleApi;
  let frameLog: FrameLogService;
  const status = signal<ConnectionStatus>('connected');
  const sendCommand = vi.fn(() => Promise.resolve());

  const entries = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.log-entry'));
  const text = (): string => fixture.nativeElement.textContent;

  beforeEach(() => {
    status.set('connected');
    sendCommand.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConnectionService,
          useValue: {
            status,
            connected: computed(() => status() === 'connected'),
            error: signal(null),
            deviceName: signal('DK_flaps_controller'),
            deviceInfo: signal(null),
            sendCommand,
          },
        },
      ],
    });
    frameLog = TestBed.inject(FrameLogService);
    fixture = TestBed.createComponent(DevConsolePage);
    page = fixture.componentInstance as unknown as DevConsoleApi;
    fixture.detectChanges();
  });

  it('shows frames as command name and JSON payload', () => {
    frameLog.add('tx', { command: 0x03, seq: 7, payload: new Uint8Array() });
    frameLog.add('rx', { command: 0x81, seq: 1, payload: hex('08 01 10 01 18 01 20 C0 3E') });
    fixture.detectChanges();

    expect(entries()).toHaveLength(2);
    expect(entries()[0].textContent).toContain('PING');
    expect(entries()[0].textContent).toContain('seq 7');
    expect(entries()[1].textContent).toContain('START_SESSION');
    expect(entries()[1].textContent).toContain('0x81');
    expect(entries()[1].textContent).toContain('"sessionTimeoutMs":8000');
  });

  it('filters frames by command, keeping requests with their responses', () => {
    frameLog.add('tx', { command: 0x03, seq: 1, payload: new Uint8Array() });
    frameLog.add('rx', { command: 0x83, seq: 1, payload: new Uint8Array() });
    frameLog.add('tx', { command: 0x02, seq: 2, payload: new Uint8Array() });

    page.onFilterChange([Command.PING]);
    fixture.detectChanges();

    expect(entries()).toHaveLength(2);
    expect(entries().every((entry) => entry.textContent?.includes('PING'))).toBe(true);
  });

  it('sends a command by name with an empty payload', async () => {
    page.command.set('ping');
    await page.send();

    expect(sendCommand).toHaveBeenCalledWith(Command.PING, {});
  });

  it('sends a command with a JSON payload', async () => {
    page.command.set('START_SESSION {"appId": 1179402576, "protocolVersionMajor": 1}');
    await page.send();

    expect(sendCommand).toHaveBeenCalledWith(Command.START_SESSION, {
      appId: 1179402576,
      protocolVersionMajor: 1,
    });
  });

  it('reports an unknown command or invalid JSON without sending', async () => {
    page.command.set('FOO');
    await page.send();
    fixture.detectChanges();
    expect(text()).toContain('Nieznana komenda');

    page.command.set('PING {broken');
    await page.send();
    fixture.detectChanges();
    expect(text()).toContain('poprawnym JSON');

    expect(sendCommand).not.toHaveBeenCalled();
  });

  it('does not send while disconnected', async () => {
    status.set('disconnected');
    page.command.set('PING');
    await page.send();

    expect(sendCommand).not.toHaveBeenCalled();
  });
});
