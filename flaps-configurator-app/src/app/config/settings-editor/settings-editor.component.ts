import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import {
  ConfigurationSettings,
  MAX_MOVE_TIME_MS,
  MIN_MOVE_TIME_MS,
} from '../../core/configuration.service';
import { FlapsState, Logic, Signal } from '../../core/protocol/gen/flaps_pb';
import { parseInteger } from '../config-format';

/** Wartość pola selektora „brak” — ion-select nie rozróżnia undefined. */
const NO_SELECTOR = -1;

/**
 * Okno ustawień ogólnych: selektor, logika domyślna, stan bezpieczny, czas ruchu, terminator.
 * Zamyka się z ustawieniami (rola 'save') albo 'cancel'.
 */
@Component({
  selector: 'app-settings-editor',
  templateUrl: './settings-editor.component.html',
  styleUrls: ['./settings-editor.component.scss'],
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
    IonToggle,
  ],
})
export class SettingsEditorComponent implements OnInit {
  private readonly modal = inject(ModalController);

  // componentProps z ModalController (przypisywane przed ngOnInit)
  signals: Signal[] = [];
  logics: Logic[] = [];
  settings?: ConfigurationSettings;

  protected readonly selector = signal(NO_SELECTOR);
  protected readonly defaultLogic = signal(0);
  protected readonly failSafeState = signal(FlapsState.CLOSED);
  protected readonly moveTimeText = signal('250');
  protected readonly termination = signal(false);
  protected readonly moveTime = computed(() => parseInteger(this.moveTimeText()));

  protected readonly NO_SELECTOR = NO_SELECTOR;
  protected readonly FlapsState = FlapsState;
  protected readonly MIN_MOVE_TIME_MS = MIN_MOVE_TIME_MS;
  protected readonly MAX_MOVE_TIME_MS = MAX_MOVE_TIME_MS;

  protected readonly selectorError = computed(() => {
    if (this.selector() === NO_SELECTOR) {
      return this.logics.length > 1
        ? 'Kilka logik wymaga selektora — bez niego może być tylko jedna.'
        : null;
    }
    const seen = new Map<number, number>();
    for (const [i, logic] of this.logics.entries()) {
      const other = seen.get(logic.selectorValue);
      if (other !== undefined) {
        return `Logiki ${logicName(this.logics, other)} i ${logicName(this.logics, i)} mają tę samą wartość selektora (${logic.selectorValue}).`;
      }
      seen.set(logic.selectorValue, i);
    }
    return null;
  });

  protected readonly moveTimeError = computed(() => {
    const time = this.moveTime();
    return Number.isNaN(time) || time < MIN_MOVE_TIME_MS || time > MAX_MOVE_TIME_MS
      ? `Podaj czas od ${MIN_MOVE_TIME_MS} do ${MAX_MOVE_TIME_MS} ms.`
      : null;
  });

  protected readonly valid = computed(() => !this.selectorError() && !this.moveTimeError());

  protected readonly logicName = (index: number): string => logicName(this.logics, index);

  constructor() {
    addIcons({ close });
  }

  ngOnInit(): void {
    const settings = this.settings;
    if (settings) {
      this.selector.set(settings.selectorSignal ?? NO_SELECTOR);
      this.defaultLogic.set(settings.defaultLogicIndex);
      this.failSafeState.set(
        settings.failSafeState === FlapsState.OPEN ? FlapsState.OPEN : FlapsState.CLOSED,
      );
      this.moveTimeText.set(String(settings.moveTimeMs));
      this.termination.set(settings.fdcanTermination);
    }
  }

  protected onSelector(value: unknown): void {
    this.selector.set(typeof value === 'number' ? value : NO_SELECTOR);
  }

  protected onDefaultLogic(value: unknown): void {
    this.defaultLogic.set(Number(value));
  }

  protected onFailSafe(value: unknown): void {
    this.failSafeState.set(value === 'open' ? FlapsState.OPEN : FlapsState.CLOSED);
  }

  protected onMoveTime(value: unknown): void {
    this.moveTimeText.set(typeof value === 'string' ? value : '');
  }

  protected async save(): Promise<void> {
    if (!this.valid()) {
      return;
    }
    const settings: ConfigurationSettings = {
      selectorSignal: this.selector() === NO_SELECTOR ? undefined : this.selector(),
      defaultLogicIndex: this.defaultLogic(),
      failSafeState: this.failSafeState(),
      moveTimeMs: this.moveTime(),
      fdcanTermination: this.termination(),
    };
    await this.modal.dismiss(settings, 'save');
  }

  protected async close(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }
}

function logicName(logics: Logic[], index: number): string {
  return `„${logics[index]?.description || index + 1}”`;
}
