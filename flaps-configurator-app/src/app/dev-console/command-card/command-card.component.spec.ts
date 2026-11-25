import { computed, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService, ConnectionStatus } from '../../core/connection.service';
import { DevCommandService } from '../../core/dev-command.service';
import { Command } from '../../core/protocol/messages';
import { CommandCardComponent } from './command-card.component';

// Dostęp do chronionych składowych na potrzeby testu
interface CommandCardApi {
  command: WritableSignal<string>;
  send(): Promise<void>;
}

describe('CommandCardComponent', () => {
  let fixture: ComponentFixture<CommandCardComponent>;
  let page: CommandCardApi;
  const status = signal<ConnectionStatus>('connected');
  const sendCommand = vi.fn(() => Promise.resolve());

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
          },
        },
        { provide: DevCommandService, useValue: { send: sendCommand } },
      ],
    });
    fixture = TestBed.createComponent(CommandCardComponent);
    page = fixture.componentInstance as unknown as CommandCardApi;
    fixture.detectChanges();
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
