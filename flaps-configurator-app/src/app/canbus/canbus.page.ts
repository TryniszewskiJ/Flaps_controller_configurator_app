import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, play, pulseOutline, stop } from 'ionicons/icons';
import { CanSniffService, SniffedFrame } from '../core/can-sniff.service';
import { ConnectionService } from '../core/connection.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { StickToBottomDirective } from '../shared/stick-to-bottom.directive';
import { ThemeToggleComponent } from '../shared/theme-toggle/theme-toggle.component';

type SniffView = 'history' | 'latest';

/**
 * Podsłuch CAN: ▶ zaczyna od zera (CAN_SNIFF_START), ■ kończy. Historia ramek albo widok
 * „Ostatnie” — jedna, nadpisywana linia na każde ID.
 */
@Component({
  selector: 'app-canbus',
  templateUrl: './canbus.page.html',
  styleUrls: ['./canbus.page.scss'],
  imports: [
    ThemeToggleComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonToggle,
    ConnectionBannerComponent,
    StickToBottomDirective,
  ],
})
export class CanbusPage {
  private readonly connection = inject(ConnectionService);
  protected readonly sniff = inject(CanSniffService);

  protected readonly connected = this.connection.application;
  protected readonly view = signal<SniffView>('history');
  /** Cała magistrala zamiast samych ramek z konfiguracji — działa od następnego startu. */
  protected readonly allFrames = signal(true);

  private readonly scroller = viewChild(StickToBottomDirective);
  /** Historia zatrzymana, gdy lista jest przewinięta w górę — nowe ramki jej nie przesuwają. */
  private readonly frozen = signal<SniffedFrame[] | null>(null);

  protected readonly history = computed(() => this.frozen() ?? this.sniff.history());
  /** Ramki, które przyszły od zatrzymania widoku. */
  protected readonly newer = computed(() => {
    const frozen = this.frozen();
    const last = frozen?.at(-1);
    if (!frozen || !last) {
      return 0;
    }
    const history = this.sniff.history();
    return history.length - 1 - history.findIndex((frame) => frame.id === last.id);
  });

  protected readonly hasFrames = computed(() => this.sniff.history().length > 0);

  constructor() {
    addIcons({ add, play, pulseOutline, stop });

    effect(() => {
      const atBottom = this.scroller()?.atBottom() ?? true;
      untracked(() => this.frozen.set(atBottom ? null : this.sniff.history()));
    });
  }

  protected async start(): Promise<void> {
    this.frozen.set(null);
    this.scroller()?.scrollToBottom();
    await this.sniff.start(this.allFrames());
  }

  protected async stop(): Promise<void> {
    await this.sniff.stop();
  }

  protected onView(value: unknown): void {
    if (value === 'history' || value === 'latest') {
      this.view.set(value);
    }
  }

  protected jumpToLatest(): void {
    this.scroller()?.scrollToBottom();
  }

  /** ID w hex: 0x180, extended z 8 cyframi. */
  protected canId(frame: SniffedFrame): string {
    return `0x${frame.canId
      .toString(16)
      .toUpperCase()
      .padStart(frame.extendedId ? 8 : 3, '0')}`;
  }

  protected bytes(frame: SniffedFrame): string[] {
    return Array.from(frame.data, (byte) => byte.toString(16).toUpperCase().padStart(2, '0'));
  }

  /** Czas od startu podsłuchu, np. "12.3456". */
  protected time(frame: SniffedFrame): string {
    return (frame.timeUs / 1e6).toFixed(4);
  }

  protected period(us: number | null): string {
    return us === null ? '—' : `${(us / 1000).toFixed(1)} ms`;
  }
}
