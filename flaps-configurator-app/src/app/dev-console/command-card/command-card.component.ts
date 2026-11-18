import { Component, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonTextarea } from '@ionic/angular';
import { JsonValue } from '@bufbuild/protobuf';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { ConnectionService } from '../../core/connection.service';
import {
  commandName,
  commandTemplate,
  parseCommand,
  REQUEST_COMMANDS,
} from '../../core/protocol/commands';
import { Command } from '../../core/protocol/gen/flaps_pb';

/** Wysyłanie dowolnej komendy: "NAZWA {json}" z podpowiedziami szablonów. */
@Component({
  selector: 'app-command-card',
  templateUrl: './command-card.component.html',
  styleUrls: ['./command-card.component.scss'],
  imports: [IonTextarea, IonButton, IonIcon],
})
export class CommandCardComponent {
  private readonly connection = inject(ConnectionService);

  protected readonly connected = this.connection.connected;
  protected readonly requestCommands = REQUEST_COMMANDS.map((command) => ({
    command,
    name: commandName(command),
  }));

  /** Zwinięta karta oddaje miejsce logowi. */
  protected readonly open = signal(true);
  protected readonly command = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  constructor() {
    addIcons({ chevronDown });
  }

  protected onCommandInput(value: string | null | undefined): void {
    this.command.set(value ?? '');
    this.sendError.set(null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter wysyła, Shift+Enter dodaje nową linię
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.send();
    }
  }

  protected insertTemplate(command: Command): void {
    this.command.set(commandTemplate(command));
    this.sendError.set(null);
  }

  /** "NAZWA {json}" — payload w formacie modelu żądania z flaps.proto. */
  protected async send(): Promise<void> {
    const text = this.command().trim();
    if (!text || !this.connected() || this.sending()) {
      return;
    }

    const [, name, json] = /^(\S+)\s*([\s\S]*)$/.exec(text) ?? [];
    const command = parseCommand(name ?? '');
    if (command === null) {
      this.sendError.set(`Nieznana komenda "${name}". Dostępne: ${this.availableNames()}.`);
      return;
    }

    let payload: JsonValue = {};
    if (json) {
      try {
        payload = JSON.parse(json) as JsonValue;
      } catch {
        this.sendError.set('Payload nie jest poprawnym JSON-em.');
        return;
      }
    }

    this.sending.set(true);
    this.sendError.set(null);
    try {
      await this.connection.sendCommand(command, payload);
    } catch (error) {
      this.sendError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.sending.set(false);
    }
  }

  protected clearCommand(): void {
    this.command.set('');
    this.sendError.set(null);
  }

  private availableNames(): string {
    return this.requestCommands.map((c) => c.name).join(', ');
  }
}
