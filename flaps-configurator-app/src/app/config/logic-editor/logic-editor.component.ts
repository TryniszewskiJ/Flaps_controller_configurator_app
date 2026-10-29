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
import { LOGIC_DESCRIPTION_MAX_BYTES } from '../../core/configuration.service';
import {
  FixedLogicSchema,
  FlapsState,
  HysteresisLogicSchema,
  Logic,
  LogicSchema,
  Signal,
  SimpleSwitchLogicSchema,
} from '../../core/protocol/gen/flaps_pb';
import { parseInteger, parseNumber, roundFloat, utf8Length } from '../config-format';

export type LogicType = 'fixed' | 'simpleSwitch' | 'hysteresis';

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/**
 * Okno edycji logiki: opis, wartość selektora, typ i jego parametry.
 * Zamyka się z logiką (rola 'save'), 'delete' albo 'cancel'.
 */
@Component({
  selector: 'app-logic-editor',
  templateUrl: './logic-editor.component.html',
  styleUrls: ['./logic-editor.component.scss'],
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
  ],
})
export class LogicEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  logics: Logic[] = [];
  signals: Signal[] = [];
  /** Edytowana logika; null = nowa. */
  index: number | null = null;
  /** Sygnał selektora; brak = jedna logika, wartość selektora nieużywana. */
  selectorSignal?: number;

  protected readonly description = signal('');
  protected readonly type = signal<LogicType>('hysteresis');
  protected readonly fixedState = signal(FlapsState.CLOSED);
  protected readonly input = signal<number | null>(null);
  // Pola liczbowe jako tekst — wpisywane „-” albo „0.” nie może zniknąć
  protected readonly selectorText = signal('0');
  protected readonly openValueText = signal('1');
  protected readonly closeValueText = signal('0');
  protected readonly openAboveText = signal('0');
  protected readonly closeBelowText = signal('0');
  protected readonly selectorValue = computed(() => parseInteger(this.selectorText()));
  protected readonly openValue = computed(() => parseInteger(this.openValueText()));
  protected readonly closeValue = computed(() => parseInteger(this.closeValueText()));
  protected readonly openAbove = computed(() => parseNumber(this.openAboveText()));
  protected readonly closeBelow = computed(() => parseNumber(this.closeBelowText()));

  protected readonly FlapsState = FlapsState;

  protected readonly hasSelector = computed(() => this.selectorSignal !== undefined);
  protected readonly selectorName = computed(() =>
    this.selectorSignal !== undefined ? this.signals[this.selectorSignal]?.name : undefined,
  );
  protected readonly inputName = computed(() => {
    const input = this.input();
    return (input !== null && this.signals[input]?.name) || 'sygnał';
  });

  protected readonly descriptionError = computed(() =>
    utf8Length(this.description().trim()) > LOGIC_DESCRIPTION_MAX_BYTES
      ? `Opis może mieć najwyżej ${LOGIC_DESCRIPTION_MAX_BYTES} bajtów (polskie znaki liczą się podwójnie).`
      : null,
  );

  protected readonly selectorError = computed(() => {
    if (!this.hasSelector()) {
      return null;
    }
    const value = this.selectorValue();
    if (!isInt32(value)) {
      return 'Podaj liczbę całkowitą.';
    }
    const other = this.logics.findIndex(
      (logic, i) => i !== this.index && logic.selectorValue === value,
    );
    return other >= 0
      ? `Tę wartość ma już logika „${this.logics[other].description || other + 1}”.`
      : null;
  });

  protected readonly inputError = computed(() => {
    if (this.type() === 'fixed' || this.input() !== null) {
      return null;
    }
    return this.signals.length > 0 ? 'Wybierz sygnał wejściowy.' : 'Dodaj najpierw sygnał.';
  });

  protected readonly parametersError = computed(() => {
    switch (this.type()) {
      case 'fixed':
        return null;
      case 'simpleSwitch':
        if (!isInt32(this.openValue()) || !isInt32(this.closeValue())) {
          return 'Wartości przełącznika muszą być liczbami całkowitymi.';
        }
        return this.openValue() === this.closeValue()
          ? 'Wartość otwarcia i zamknięcia muszą się różnić.'
          : null;
      case 'hysteresis':
        if (!Number.isFinite(this.openAbove()) || !Number.isFinite(this.closeBelow())) {
          return 'Progi muszą być liczbami.';
        }
        return this.closeBelow() > this.openAbove()
          ? 'Próg zamknięcia nie może być wyżej niż próg otwarcia.'
          : null;
    }
  });

  protected readonly valid = computed(
    () =>
      !this.descriptionError() &&
      !this.selectorError() &&
      !this.inputError() &&
      !this.parametersError(),
  );

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    const edited = this.index !== null ? this.logics[this.index] : undefined;
    if (edited) {
      this.description.set(edited.description);
      this.selectorText.set(String(edited.selectorValue));
      this.input.set(edited.inputSignal ?? null);
      const parameters = edited.parameters;
      switch (parameters.case) {
        case 'fixed':
          this.type.set('fixed');
          this.fixedState.set(parameters.value.state);
          break;
        case 'simpleSwitch':
          this.type.set('simpleSwitch');
          this.openValueText.set(String(parameters.value.openValue));
          this.closeValueText.set(String(parameters.value.closeValue));
          break;
        case 'hysteresis':
          this.type.set('hysteresis');
          this.openAboveText.set(String(roundFloat(parameters.value.openAbove)));
          this.closeBelowText.set(String(roundFloat(parameters.value.closeBelow)));
          break;
      }
    } else {
      // Pierwsza wolna wartość selektora i pierwszy sygnał, który nie jest selektorem
      const values = this.logics.map((logic) => logic.selectorValue);
      this.selectorText.set(String(values.length > 0 ? Math.max(...values) + 1 : 0));
      const input = this.signals.findIndex((_, i) => i !== this.selectorSignal);
      this.input.set(input >= 0 ? input : this.signals.length > 0 ? 0 : null);
      if (this.signals.length === 0) {
        this.type.set('fixed');
      }
    }
  }

  protected onType(value: unknown): void {
    if (value === 'fixed' || value === 'simpleSwitch' || value === 'hysteresis') {
      this.type.set(value);
    }
  }

  protected onFixedState(value: unknown): void {
    this.fixedState.set(value === 'open' ? FlapsState.OPEN : FlapsState.CLOSED);
  }

  protected onInput(value: unknown): void {
    this.input.set(typeof value === 'number' ? value : null);
  }

  protected onText(
    target: 'description' | 'selector' | 'openValue' | 'closeValue' | 'openAbove' | 'closeBelow',
    value: unknown,
  ): void {
    const fields = {
      description: this.description,
      selector: this.selectorText,
      openValue: this.openValueText,
      closeValue: this.closeValueText,
      openAbove: this.openAboveText,
      closeBelow: this.closeBelowText,
    };
    fields[target].set(typeof value === 'string' ? value : '');
  }

  protected async save(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    const logic = create(LogicSchema, {
      // Bez selektora firmware nie używa wartości — zostaje poprzednia
      selectorValue: this.hasSelector()
        ? this.selectorValue()
        : this.index !== null
          ? this.logics[this.index].selectorValue
          : 0,
      description: this.description().trim(),
      inputSignal: this.type() === 'fixed' ? undefined : (this.input() ?? undefined),
      parameters: this.parameters(),
    });
    await this.modal.dismiss(logic, 'save');
  }

  protected async remove(): Promise<void> {
    await this.modal.dismiss(null, 'delete');
  }

  protected async close(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }

  private parameters(): Logic['parameters'] {
    switch (this.type()) {
      case 'fixed':
        return { case: 'fixed', value: create(FixedLogicSchema, { state: this.fixedState() }) };
      case 'simpleSwitch':
        return {
          case: 'simpleSwitch',
          value: create(SimpleSwitchLogicSchema, {
            openValue: this.openValue(),
            closeValue: this.closeValue(),
          }),
        };
      case 'hysteresis':
        return {
          case: 'hysteresis',
          value: create(HysteresisLogicSchema, {
            // Pola float w protokole — te same wartości, co wrócą z urządzenia
            openAbove: Math.fround(this.openAbove()),
            closeBelow: Math.fround(this.closeBelow()),
          }),
        };
    }
  }
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX;
}
