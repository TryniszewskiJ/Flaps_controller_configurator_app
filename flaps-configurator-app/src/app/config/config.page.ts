import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronForward, downloadOutline } from 'ionicons/icons';
import {
  ConfigurationService,
  ConfigurationSettings,
  MAX_FRAMES,
  MAX_LOGICS,
  MAX_SIGNALS,
} from '../core/configuration.service';
import { ConnectionService } from '../core/connection.service';
import { CanFrame, Logic, Signal } from '../core/protocol/gen/flaps_pb';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import {
  flapsStateLabel,
  frameLabel,
  logicSummary,
  signalLayoutLabel,
  signalScaleLabel,
} from './config-format';
import { FrameEditorComponent } from './frame-editor/frame-editor.component';
import { LogicEditorComponent } from './logic-editor/logic-editor.component';
import { SettingsEditorComponent } from './settings-editor/settings-editor.component';
import { SignalEditorComponent } from './signal-editor/signal-editor.component';

type EditorComponent =
  | typeof FrameEditorComponent
  | typeof SignalEditorComponent
  | typeof LogicEditorComponent
  | typeof SettingsEditorComponent;

@Component({
  selector: 'app-config',
  templateUrl: './config.page.html',
  styleUrls: ['./config.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    ConnectionBannerComponent,
  ],
})
export class ConfigPage {
  private readonly modal = inject(ModalController);
  private readonly alert = inject(AlertController);
  protected readonly config = inject(ConfigurationService);
  protected readonly connected = inject(ConnectionService).connected;

  protected readonly draft = this.config.draft;
  protected readonly busy = this.config.busy;
  /** Komunikat edycji (np. dlaczego nie można usunąć ramki). */
  protected readonly notice = signal<string | null>(null);

  protected readonly canEdit = computed(() => this.connected() && !!this.draft() && !this.busy());
  protected readonly canAddFrame = computed(
    () => this.canEdit() && (this.draft()?.frames.length ?? 0) < MAX_FRAMES,
  );
  protected readonly canAddSignal = computed(
    () =>
      this.canEdit() &&
      (this.draft()?.frames.length ?? 0) > 0 &&
      (this.draft()?.signals.length ?? 0) < MAX_SIGNALS,
  );
  /** Bez selektora sterownik przyjmuje tylko jedną logikę. */
  protected readonly needsSelector = computed(() => {
    const draft = this.draft();
    return !!draft && draft.selectorSignal === undefined && draft.logics.length > 0;
  });
  protected readonly canAddLogic = computed(
    () =>
      this.canEdit() && !this.needsSelector() && (this.draft()?.logics.length ?? 0) < MAX_LOGICS,
  );

  protected readonly status = computed(() => {
    if (this.config.dirty()) {
      return 'Zmiany tylko w aplikacji — Testuj wysyła je do sterownika.';
    }
    if (this.config.unsavedOnDevice()) {
      return 'Sterownik używa konfiguracji niezapisanej we flashu — reset ją cofnie.';
    }
    return 'Konfiguracja zapisana w sterowniku.';
  });

  protected readonly frameLabel = frameLabel;
  protected readonly signalLayoutLabel = signalLayoutLabel;
  protected readonly signalScaleLabel = signalScaleLabel;
  protected readonly logicSummary = logicSummary;
  protected readonly flapsStateLabel = flapsStateLabel;

  constructor() {
    addIcons({ chevronForward, downloadOutline });
  }

  protected signalCount(frameIndex: number): number {
    return this.draft()?.signals.filter((signal) => signal.frameIndex === frameIndex).length ?? 0;
  }

  protected signalFrame(signal: Signal): string {
    const frame = this.draft()?.frames[signal.frameIndex];
    return frame ? frameLabel(frame) : '—';
  }

  protected async read(): Promise<void> {
    if (
      this.config.dirty() &&
      !(await this.confirm('Odrzucić zmiany i odczytać konfigurację ze sterownika?'))
    ) {
      return;
    }
    this.notice.set(null);
    await this.config.read();
  }

  protected async apply(): Promise<void> {
    this.notice.set(null);
    await this.config.apply();
  }

  protected async save(): Promise<void> {
    this.notice.set(null);
    await this.config.save();
  }

  protected discard(): void {
    this.notice.set(null);
    this.config.discard();
  }

  protected async editFrame(index: number | null): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canEdit()) {
      return;
    }
    const { data, role } = await this.openEditor<CanFrame>(FrameEditorComponent, {
      frames: draft.frames,
      index,
    });

    this.notice.set(null);
    if (role === 'save' && data) {
      this.config.setFrame(index, data);
    } else if (role === 'delete' && index !== null) {
      this.notice.set(this.config.removeFrame(index));
    }
  }

  protected async editSignal(index: number | null): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canEdit()) {
      return;
    }
    const { data, role } = await this.openEditor<Signal>(SignalEditorComponent, {
      frames: draft.frames,
      signals: draft.signals,
      index,
    });

    this.notice.set(null);
    if (role === 'save' && data) {
      this.config.setSignal(index, data);
    } else if (role === 'delete' && index !== null) {
      this.notice.set(this.config.removeSignal(index));
    }
  }

  protected async editLogic(index: number | null): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canEdit()) {
      return;
    }
    const { data, role } = await this.openEditor<Logic>(LogicEditorComponent, {
      logics: draft.logics,
      signals: draft.signals,
      index,
      selectorSignal: draft.selectorSignal,
    });

    this.notice.set(null);
    if (role === 'save' && data) {
      this.config.setLogic(index, data);
    } else if (role === 'delete' && index !== null) {
      this.notice.set(this.config.removeLogic(index));
    }
  }

  protected async editSettings(): Promise<void> {
    const draft = this.draft();
    if (!draft || !this.canEdit()) {
      return;
    }
    const settings: ConfigurationSettings = {
      selectorSignal: draft.selectorSignal,
      defaultLogicIndex: draft.defaultLogicIndex,
      failSafeState: draft.failSafeState,
      moveTimeMs: draft.moveTimeMs,
      fdcanTermination: draft.fdcanTermination,
    };
    const { data, role } = await this.openEditor<ConfigurationSettings>(SettingsEditorComponent, {
      signals: draft.signals,
      logics: draft.logics,
      settings,
    });

    this.notice.set(null);
    if (role === 'save' && data) {
      this.config.setSettings(data);
    }
  }

  private async openEditor<T>(
    component: EditorComponent,
    componentProps: Record<string, unknown>,
  ): Promise<{ data?: T; role?: string }> {
    const editor = await this.modal.create({ component, componentProps });
    await editor.present();
    return editor.onWillDismiss<T>();
  }

  private async confirm(message: string): Promise<boolean> {
    const alert = await this.alert.create({
      message,
      buttons: [
        { text: 'Anuluj', role: 'cancel' },
        { text: 'Odczytaj', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
