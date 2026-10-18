import { Component, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonTextarea, IonToolbar } from '@ionic/angular';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';

type Direction = 'tx' | 'rx';

interface ConsoleEntry {
  id: number;
  time: string;
  direction: Direction;
  data: string;
}

@Component({
  selector: 'app-dev-console',
  templateUrl: './dev-console.page.html',
  styleUrls: ['./dev-console.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonTextarea, IonButton, ConnectionBannerComponent],
})
export class DevConsolePage {
  protected readonly connected = inject(ConnectionService).connected;

  protected readonly command = signal('');
  protected readonly entries = signal<ConsoleEntry[]>([]);

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private nextId = 0;

  constructor() {
    // Przewijanie logu do najnowszego wpisu
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
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter wysyła, Shift+Enter dodaje nową linię
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    const data = this.command().trim();
    if (!data || !this.connected()) {
      return;
    }

    this.addEntry('tx', data);
    this.command.set('');

    // TODO: wysyłanie przez BLE. Na razie mock odpowiedzi urządzenia.
    setTimeout(() => this.addEntry('rx', `OK ${data}`), 150);
  }

  protected clearCommand(): void {
    this.command.set('');
  }

  protected clearLog(): void {
    this.entries.set([]);
  }

  private addEntry(direction: Direction, data: string): void {
    const entry: ConsoleEntry = {
      id: this.nextId++,
      time: formatTime(new Date()),
      direction,
      data,
    };
    this.entries.update((entries) => [...entries, entry]);
  }
}

function formatTime(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
