import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { create } from '@bufbuild/protobuf';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { layoutFromRange, signalBits, valueRange } from '../../core/can/signal-layout';
import { SIGNAL_NAME_MAX_BYTES } from '../../core/configuration.service';
import { CanFrame, Signal, SignalSchema } from '../../core/protocol/gen/flaps_pb';
import { BitGridComponent, OccupiedBits } from '../../shared/bit-grid/bit-grid.component';
import { frameLabel, parseInteger, parseNumber, roundFloat, utf8Length } from '../config-format';

/**
 * Okno edycji sygnału: ramka, bity (siatka jak w SavvyCAN), skala i offset.
 * Zamyka się z sygnałem (rola 'save'), 'delete' albo 'cancel'.
 */
@Component({
  selector: 'app-signal-editor',
  templateUrl: './signal-editor.component.html',
  styleUrls: ['./signal-editor.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    BitGridComponent,
  ],
})
export class SignalEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  frames: CanFrame[] = [];
  signals: Signal[] = [];
  /** Edytowany sygnał; null = nowy. */
  index: number | null = null;
  /** Ramka nowego sygnału. */
  frameIndex = 0;

  protected readonly name = signal('');
  protected readonly frame = signal(0);
  protected readonly bigEndian = signal(true);
  protected readonly signed = signal(false);
  // Pola liczbowe jako tekst — wpisywane „0.” nie może zamienić się w „0”
  protected readonly startText = signal('7');
  protected readonly lengthText = signal('8');
  protected readonly scaleText = signal('1');
  protected readonly biasText = signal('0');
  protected readonly startingBit = computed(() => parseInteger(this.startText()));
  protected readonly lengthBits = computed(() => parseInteger(this.lengthText()));
  protected readonly scale = computed(() => parseNumber(this.scaleText()));
  protected readonly bias = computed(() => parseNumber(this.biasText()));
  /** Pierwszy dotknięty bit, czeka na drugi. */
  protected readonly anchor = signal<number | null>(null);

  protected readonly frameLabel = frameLabel;

  protected readonly bits = computed(() =>
    signalBits({
      startingBit: this.startingBit(),
      lengthBits: this.lengthBits(),
      bigEndian: this.bigEndian(),
    }),
  );

  /** Pozostałe sygnały tej samej ramki. */
  protected readonly others = computed<OccupiedBits[]>(() =>
    this.signals
      .filter((other, i) => i !== this.index && other.frameIndex === this.frame())
      .map((other) => ({
        name: other.name,
        bits:
          signalBits({
            startingBit: other.startingBit,
            lengthBits: other.lengthBits,
            bigEndian: other.bigEndian,
          }) ?? [],
      })),
  );

  protected readonly overlaps = computed(() => {
    const bits = new Set(this.bits() ?? []);
    return this.others()
      .filter((other) => other.bits.some((bit) => bits.has(bit)))
      .map((other) => other.name);
  });

  protected readonly range = computed(() => {
    const [min, max] = valueRange(this.lengthBits(), this.scale(), this.bias(), this.signed());
    return `${formatNumber(min)} … ${formatNumber(max)}`;
  });

  protected readonly nameError = computed(() => {
    const name = this.name().trim();
    if (!name) {
      return 'Podaj nazwę sygnału.';
    }
    if (utf8Length(name) > SIGNAL_NAME_MAX_BYTES) {
      return `Nazwa może mieć najwyżej ${SIGNAL_NAME_MAX_BYTES} bajtów (polskie znaki liczą się podwójnie).`;
    }
    return null;
  });

  protected readonly layoutError = computed(() =>
    this.bits() ? null : 'Sygnał nie mieści się w 8 bajtach ramki.',
  );

  protected readonly scaleError = computed(() => {
    if (!Number.isFinite(this.scale()) || this.scale() === 0) {
      return 'Skala musi być liczbą różną od 0.';
    }
    return Number.isFinite(this.bias()) ? null : 'Offset musi być liczbą.';
  });

  protected readonly valid = computed(
    () => this.frames.length > 0 && !this.nameError() && !this.layoutError() && !this.scaleError(),
  );

  protected readonly hint = computed(() =>
    this.anchor() === null
      ? 'Dotknij pierwszego bitu sygnału, potem ostatniego.'
      : 'Dotknij ostatniego bitu sygnału.',
  );

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    const edited = this.index !== null ? this.signals[this.index] : undefined;
    if (edited) {
      this.name.set(edited.name);
      this.frame.set(edited.frameIndex);
      this.bigEndian.set(edited.bigEndian);
      this.signed.set(edited.isSigned);
      this.startText.set(String(edited.startingBit));
      this.lengthText.set(String(edited.lengthBits));
      this.scaleText.set(String(roundFloat(edited.scale)));
      this.biasText.set(String(roundFloat(edited.bias)));
    } else {
      // Domyślnie pierwszy bajt ramki, Motorola od bitu 7
      this.frame.set(this.frameIndex);
    }
  }

  /** Pierwsze dotknięcie wybiera jeden bit, drugie rozciąga zaznaczenie do niego. */
  protected onBitTap(bit: number): void {
    const anchor = this.anchor();
    const layout = layoutFromRange(anchor ?? bit, bit, this.bigEndian());
    this.startText.set(String(layout.startingBit));
    this.lengthText.set(String(layout.lengthBits));
    this.anchor.set(anchor === null ? bit : null);
  }

  protected onByteOrder(value: unknown): void {
    this.bigEndian.set(value === 'motorola');
    this.anchor.set(null);
  }

  protected onSigned(value: unknown): void {
    this.signed.set(value === 'signed');
  }

  protected onNumber(target: 'start' | 'length' | 'scale' | 'bias', value: unknown): void {
    const text = typeof value === 'string' ? value : '';
    const fields = {
      start: this.startText,
      length: this.lengthText,
      scale: this.scaleText,
      bias: this.biasText,
    };
    fields[target].set(text);
    if (target === 'start' || target === 'length') {
      this.anchor.set(null);
    }
  }

  protected onName(value: unknown): void {
    this.name.set(typeof value === 'string' ? value : '');
  }

  protected onFrame(value: unknown): void {
    this.frame.set(Number(value));
  }

  protected async save(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    const result = create(SignalSchema, {
      frameIndex: this.frame(),
      startingBit: this.startingBit(),
      lengthBits: this.lengthBits(),
      bigEndian: this.bigEndian(),
      isSigned: this.signed(),
      // Pole float w protokole — ta sama wartość, co wróci z urządzenia
      scale: Math.fround(this.scale()),
      bias: Math.fround(this.bias()),
      name: this.name().trim(),
    });
    await this.modal.dismiss(result, 'save');
  }

  protected async remove(): Promise<void> {
    await this.modal.dismiss(null, 'delete');
  }

  protected async close(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }
}

function formatNumber(value: number): string {
  return String(roundFloat(value));
}
