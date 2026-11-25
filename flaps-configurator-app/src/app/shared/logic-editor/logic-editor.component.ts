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
import {
  CONDITION_HYSTERESIS_MINOR,
  CONDITION_MINOR,
  conditionError,
  conditionNodes,
  conditionSize,
  conditionTree,
  conditionUsesHysteresis,
  MAX_CONDITION_NODES,
} from '../../core/condition';
import { FlapsState } from '../../core/protocol/gen/flaps_common_pb';
import {
  ConditionLogicSchema,
  FixedLogicSchema,
  HysteresisLogicSchema,
  Logic,
  LogicSchema,
  SimpleSwitchLogicSchema,
} from '../../core/protocol/gen/flaps_logic_pb';
import { PROTOCOL_VERSION_MINOR } from '../../core/protocol/protocol-client';
import {
  LOGIC_DESCRIPTION_MAX_BYTES,
  parseInteger,
  parseNumber,
  roundFloat,
  SignalName,
  utf8Length,
} from '../logic-format';
import {
  conditionFromEdit,
  EditNode,
  editRoot,
  newCompare,
  newGroup,
} from './condition-node/condition-edit';
import { ConditionNodeComponent } from './condition-node/condition-node.component';
import { TranslationKey, t } from '../../core/i18n/i18n';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export type LogicType = 'fixed' | 'simpleSwitch' | 'hysteresis' | 'condition';
const LOGIC_TYPES: LogicType[] = ['fixed', 'simpleSwitch', 'hysteresis', 'condition'];

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/**
 * Okno edycji logiki: opis, wartość selektora, typ i jego parametry (warunek: drzewo I / LUB / NIE
 * z porównań sygnałów).
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
    ConditionNodeComponent,
    TranslatePipe,
  ],
})
export class LogicEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  logics: Logic[] = [];
  /** Nazwy sygnałów urządzenia, po indeksie (więcej edytor nie potrzebuje). */
  signals: readonly SignalName[] = [];
  /** Edytowana logika; null = nowa. */
  index: number | null = null;
  /** Sygnał selektora; brak = jedna logika, wartość selektora nieużywana. */
  selectorSignal?: number;
  /** Jak nazywać logikę: „logika” (technik) albo „tryb jazdy” (aplikacja użytkownika). */
  term: 'logic' | 'mode' = 'logic';
  /** Aplikacja użytkownika: nazwy istniejącej logiki nie da się zmienić (nadaje ją technik). */
  lockName = false;
  /**
   * Aplikacja użytkownika: bez wyboru sygnału wejściowego — zostaje ten ustawiony przez technika
   * (nowa logika: pierwszy sygnał, który nie jest selektorem). Warunek (porównania sygnałów)
   * tylko dla logiki, która już nim jest.
   */
  hideInput = false;

  /** Nazwa tylko do odczytu — zamiast pola w tytule okna. */
  protected get nameLocked(): boolean {
    return this.lockName && this.index !== null;
  }

  /** Typ „Warunek” do wyboru (przy ukrytych sygnałach tylko dla logiki, która już nim jest). */
  protected get conditionSelectable(): boolean {
    return this.conditionSupported && (!this.hideInput || this.originalType === 'condition');
  }

  private originalType: LogicType | null = null;

  protected get titleKey(): TranslationKey {
    if (this.index === null) {
      return this.term === 'mode' ? 'editor.new.mode' : 'editor.new.logic';
    }
    return this.term === 'mode' ? 'editor.title.mode' : 'editor.title.logic';
  }
  /** Wersja minor protokołu urządzenia — co z warunków zna jego firmware. */
  protocolMinor = PROTOCOL_VERSION_MINOR;

  protected get conditionSupported(): boolean {
    return this.protocolMinor >= CONDITION_MINOR;
  }

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
  protected readonly condition = signal<EditNode>(newGroup('and', []));
  private readonly conditionTree = computed(() => conditionFromEdit(this.condition()));
  protected readonly conditionSize = computed(() => conditionSize(this.conditionTree()));
  protected readonly MAX_CONDITION_NODES = MAX_CONDITION_NODES;

  protected readonly FlapsState = FlapsState;

  protected readonly hasSelector = computed(() => this.selectorSignal !== undefined);
  protected readonly selectorName = computed(() =>
    this.selectorSignal !== undefined ? this.signals[this.selectorSignal]?.name : undefined,
  );
  protected readonly inputName = computed(() => {
    const input = this.input();
    return (
      (!this.hideInput && input !== null && this.signals[input]?.name) || t('editor.inputFallback')
    );
  });

  protected readonly descriptionError = computed(() =>
    utf8Length(this.description().trim()) > LOGIC_DESCRIPTION_MAX_BYTES
      ? t('editor.error.nameTooLong', { max: LOGIC_DESCRIPTION_MAX_BYTES })
      : null,
  );

  protected readonly selectorError = computed(() => {
    if (!this.hasSelector()) {
      return null;
    }
    const value = this.selectorValue();
    if (!isInt32(value)) {
      return t('editor.error.integer');
    }
    const other = this.logics.findIndex(
      (logic, i) => i !== this.index && logic.selectorValue === value,
    );
    return other >= 0
      ? t(this.term === 'mode' ? 'editor.error.duplicate.mode' : 'editor.error.duplicate.logic', {
          name: this.logics[other].description || other + 1,
        })
      : null;
  });

  /** Stała i warunek nie mają jednego sygnału wejściowego. */
  protected readonly usesInput = computed(
    () => this.type() !== 'fixed' && this.type() !== 'condition',
  );

  protected readonly inputError = computed(() => {
    if (!this.usesInput() || this.input() !== null) {
      return null;
    }
    return this.signals.length > 0 ? t('editor.error.chooseInput') : t('editor.error.noSignals');
  });

  protected readonly parametersError = computed(() => {
    switch (this.type()) {
      case 'fixed':
        return null;
      case 'simpleSwitch':
        if (!isInt32(this.openValue()) || !isInt32(this.closeValue())) {
          return t('editor.error.switchIntegers');
        }
        return this.openValue() === this.closeValue() ? t('editor.error.switchDiffer') : null;
      case 'hysteresis':
        if (!Number.isFinite(this.openAbove()) || !Number.isFinite(this.closeBelow())) {
          return t('editor.error.thresholds');
        }
        return this.closeBelow() > this.openAbove() ? t('editor.error.hysteresisOrder') : null;
      case 'condition':
        if (!this.conditionSupported) {
          return t('editor.error.noCondition');
        }
        if (
          this.protocolMinor < CONDITION_HYSTERESIS_MINOR &&
          conditionUsesHysteresis(this.conditionTree())
        ) {
          return t('editor.error.noConditionHysteresis');
        }
        return conditionError(this.conditionTree(), this.signals.length);
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
        case 'condition': {
          this.type.set('condition');
          const tree = conditionTree(parameters.value.nodes);
          if (tree) {
            this.condition.set(editRoot(tree));
          }
          break;
        }
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
    this.originalType = edited ? this.type() : null;
    if (this.condition().kind === 'group' && conditionSize(this.conditionTree()) === 0) {
      this.condition.set(newGroup('and', [newCompare(this.input())]));
    }
  }

  protected onType(value: unknown): void {
    if (LOGIC_TYPES.includes(value as LogicType)) {
      this.type.set(value as LogicType);
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
      inputSignal: this.usesInput() ? (this.input() ?? undefined) : undefined,
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
      case 'condition':
        return {
          case: 'condition',
          value: create(ConditionLogicSchema, { nodes: conditionNodes(this.conditionTree()) }),
        };
    }
  }
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX;
}
