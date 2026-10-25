import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { create } from '@bufbuild/protobuf';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import {
  MAX_EXTENDED_ID,
  MAX_FRAME_TIMEOUT_MS,
  MAX_STANDARD_ID,
} from '../../core/configuration.service';
import { CanFrame, CanFrameSchema } from '../../core/protocol/gen/flaps_pb';
import { frameId } from '../config-format';

/**
 * Okno edycji ramki CAN: ID, standard / extended, timeout.
 * Zamyka się z ramką (rola 'save'), 'delete' albo 'cancel'.
 */
@Component({
  selector: 'app-frame-editor',
  templateUrl: './frame-editor.component.html',
  styleUrls: ['./frame-editor.component.scss'],
  imports: [IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonContent, IonInput, IonToggle],
})
export class FrameEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  frames: CanFrame[] = [];
  /** Edytowana ramka; null = nowa. */
  index: number | null = null;

  protected readonly idText = signal('');
  protected readonly extended = signal(false);
  protected readonly timeoutText = signal('0');

  protected readonly id = computed(() => {
    const text = this.idText().trim().replace(/^0x/i, '');
    return /^[0-9a-f]+$/i.test(text) ? parseInt(text, 16) : NaN;
  });
  protected readonly timeout = computed(() => {
    const text = this.timeoutText().trim();
    return /^\d+$/.test(text) ? Number(text) : NaN;
  });

  protected readonly idError = computed(() => {
    const id = this.id();
    const max = this.extended() ? MAX_EXTENDED_ID : MAX_STANDARD_ID;
    if (Number.isNaN(id)) {
      return 'Podaj ID w hex, np. 180.';
    }
    if (id > max) {
      return `ID ${this.extended() ? 'extended' : 'standard'} może mieć najwyżej ${frameId({ id: max, extendedId: this.extended() })}.`;
    }
    const duplicate = this.frames.some(
      (frame, i) => i !== this.index && frame.id === id && frame.extendedId === this.extended(),
    );
    return duplicate ? 'Ta ramka jest już na liście.' : null;
  });

  protected readonly timeoutError = computed(() => {
    const timeout = this.timeout();
    return Number.isNaN(timeout) || timeout > MAX_FRAME_TIMEOUT_MS
      ? `Podaj liczbę ms od 0 do ${MAX_FRAME_TIMEOUT_MS}.`
      : null;
  });

  protected readonly valid = computed(() => !this.idError() && !this.timeoutError());

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    const edited = this.index !== null ? this.frames[this.index] : undefined;
    if (edited) {
      this.idText.set(frameId(edited).slice(2));
      this.extended.set(edited.extendedId);
      this.timeoutText.set(String(edited.timeoutMs));
    }
  }

  protected onId(value: unknown): void {
    this.idText.set(typeof value === 'string' ? value : '');
  }

  protected onTimeout(value: unknown): void {
    this.timeoutText.set(typeof value === 'string' ? value : '');
  }

  protected async save(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    const frame = create(CanFrameSchema, {
      id: this.id(),
      extendedId: this.extended(),
      timeoutMs: this.timeout(),
    });
    await this.modal.dismiss(frame, 'save');
  }

  protected async remove(): Promise<void> {
    await this.modal.dismiss(null, 'delete');
  }

  protected async close(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }
}
