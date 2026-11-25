import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward } from 'ionicons/icons';
import { ConnectionService } from '@flaps/core/connection.service';
import { Logic } from '@flaps/core/protocol/gen/flaps_logic_pb';
import { ConnectionBannerComponent } from '@flaps/shared/connection-banner/connection-banner.component';
import { LogicEditorComponent } from '@flaps/shared/logic-editor/logic-editor.component';
import { logicSummary, MAX_LOGICS } from '@flaps/shared/logic-format';
import { LogicsService } from '../core/logics.service';
import { t } from '@flaps/core/i18n/i18n';
import { TranslatePipe } from '@flaps/core/i18n/translate.pipe';

/**
 * Logiki (tryby jazdy) w wersji dla użytkownika: tylko lista logik i ich edycja (GET/SET_LOGICS)
 * — ramki CAN, sygnały i ustawienia zostają w sterowniku tak, jak ustawił je technik.
 * Wypróbuj = do resetu sterownika, Zapisz = także na stałe.
 */
@Component({
  selector: 'app-logics',
  templateUrl: './logics.page.html',
  styleUrls: ['./logics.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    ConnectionBannerComponent,
    TranslatePipe,
  ],
})
export class LogicsPage {
  private readonly modal = inject(ModalController);
  protected readonly logics = inject(LogicsService);
  private readonly connection = inject(ConnectionService);
  protected readonly connected = this.connection.connected;

  protected readonly draft = this.logics.draft;
  protected readonly busy = this.logics.busy;
  protected readonly signals = this.logics.signals;
  protected readonly notice = signal<string | null>(null);

  protected readonly canEdit = computed(() => this.connected() && !!this.draft() && !this.busy());
  /** Bez selektora (ustawia technik) sterownik przyjmuje tylko jedną logikę. */
  protected readonly hasSelector = computed(() => this.logics.selectorSignal() !== undefined);
  protected readonly canAddLogic = computed(
    () => this.canEdit() && this.hasSelector() && (this.draft()?.logics.length ?? 0) < MAX_LOGICS,
  );
  protected readonly selectorName = computed(() => {
    const selector = this.logics.selectorSignal();
    return selector !== undefined ? (this.signals()[selector]?.name ?? null) : null;
  });

  protected readonly status = computed(() => {
    if (this.logics.dirty()) {
      return t('modes.status.dirty');
    }
    if (this.logics.unsavedOnDevice()) {
      return t('modes.status.unsaved');
    }
    return t('modes.status.saved');
  });

  protected readonly logicSummary = logicSummary;

  constructor() {
    addIcons({ chevronForward });
  }

  /** Ponowny odczyt po błędzie (po połączeniu tryby czyta LogicsService sam). */
  protected async read(): Promise<void> {
    this.notice.set(null);
    await this.logics.read();
  }

  protected async apply(): Promise<void> {
    this.notice.set(null);
    await this.logics.apply();
  }

  protected async save(): Promise<void> {
    this.notice.set(null);
    await this.logics.save();
  }

  protected discard(): void {
    this.notice.set(null);
    this.logics.discard();
  }

  protected async editLogic(index: number | null): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canEdit()) {
      return;
    }
    const editor = await this.modal.create({
      component: LogicEditorComponent,
      componentProps: {
        logics: draft.logics,
        signals: this.signals(),
        index,
        selectorSignal: this.logics.selectorSignal(),
        term: 'mode',
        // Kierowca zmienia działanie trybu; nazwę i sygnał ustawia technik
        lockName: true,
        hideInput: true,
        // Starsze urządzenie odrzuci warunek (1.12) albo histerezę w warunku (1.13)
        protocolMinor: this.connection.protocolMinor() ?? 0,
      },
    });
    await editor.present();
    const { data, role } = await editor.onWillDismiss<Logic>();

    this.notice.set(null);
    if (role === 'save' && data) {
      this.logics.setLogic(index, data);
    } else if (role === 'delete' && index !== null) {
      this.notice.set(this.logics.removeLogic(index));
    }
  }
}
