import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonToolbar,
} from '@ionic/angular';
import { JsonValue } from '@bufbuild/protobuf';
import { ConnectionService } from '../core/connection.service';
import { FrameLogService } from '../core/frame-log.service';
import {
  commandName,
  commandTemplate,
  parseCommand,
  REQUEST_COMMANDS,
} from '../core/protocol/commands';
import { Command } from '../core/protocol/gen/flaps_pb';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';

interface CommandFilter {
  command: number;
  name: string;
  count: number;
}

@Component({
  selector: 'app-dev-console',
  templateUrl: './dev-console.page.html',
  styleUrls: ['./dev-console.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonTextarea,
    IonButton,
    IonSelect,
    IonSelectOption,
    ConnectionBannerComponent,
  ],
})
export class DevConsolePage {
  private readonly connection = inject(ConnectionService);
  private readonly frameLog = inject(FrameLogService);

  protected readonly connected = this.connection.connected;
  protected readonly requestCommands = REQUEST_COMMANDS.map((command) => ({
    command,
    name: commandName(command),
  }));

  protected readonly command = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  /** Komendy wybrane w filtrze; pusta lista = wszystkie. */
  protected readonly selectedCommands = signal<number[]>([]);

  /** Tekst zwiniętego filtra: same nazwy, bez liczników. */
  protected readonly selectedText = computed(() => {
    const names = this.selectedCommands().map((command) => commandName(command));
    return names.length > 0 ? names.join(', ') : null;
  });

  protected readonly filters = computed<CommandFilter[]>(() => {
    const counts = new Map<number, number>(
      [...REQUEST_COMMANDS, Command.ERROR].map((command) => [command, 0]),
    );
    for (const entry of this.frameLog.entries()) {
      counts.set(entry.baseCommand, (counts.get(entry.baseCommand) ?? 0) + 1);
    }
    return [...counts].map(([command, count]) => ({ command, name: commandName(command), count }));
  });

  protected readonly entries = computed(() => {
    const selected = new Set(this.selectedCommands());
    const entries = this.frameLog.entries();
    return selected.size === 0
      ? entries
      : entries.filter((entry) => selected.has(entry.baseCommand));
  });

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  constructor() {
    // Przewijanie logu do najnowszej ramki
    afterRenderEffect(() => {
      this.entries();
      const el = this.log()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
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

  protected clearLog(): void {
    this.frameLog.clear();
  }

  protected onFilterChange(value: number[] | null | undefined): void {
    this.selectedCommands.set(value ?? []);
  }

  protected showAll(): void {
    this.selectedCommands.set([]);
  }

  private availableNames(): string {
    return this.requestCommands.map((c) => c.name).join(', ');
  }
}
