import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonSelect, IonSelectOption, IonToggle } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDown } from 'ionicons/icons';
import { FrameLogService } from '../../core/frame-log.service';
import { commandName, REQUEST_COMMANDS } from '../../core/protocol/commands';
import { Command } from '../../core/protocol/messages';
import { StickToBottomDirective } from '../../shared/stick-to-bottom.directive';

interface CommandFilter {
  command: number;
  name: string;
  count: number;
}

/** Wysłane i odebrane ramki protokołu z filtrem komend. */
@Component({
  selector: 'app-frame-log-card',
  templateUrl: './frame-log-card.component.html',
  styleUrls: ['./frame-log-card.component.scss'],
  imports: [IonButton, IonIcon, IonSelect, IonSelectOption, IonToggle, StickToBottomDirective],
})
export class FrameLogCardComponent {
  private readonly frameLog = inject(FrameLogService);

  protected readonly open = signal(true);
  protected readonly showAmpOut = this.frameLog.showAmpOut;

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

  constructor() {
    addIcons({ chevronDown });
  }

  protected clearLog(): void {
    this.frameLog.clear();
  }

  protected onFilterChange(value: number[] | null | undefined): void {
    this.selectedCommands.set(value ?? []);
  }

  protected onShowAmpOut(show: boolean): void {
    this.frameLog.setShowAmpOut(show);
  }

  protected showAll(): void {
    this.selectedCommands.set([]);
  }
}
