import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentOutline } from 'ionicons/icons';
import { ConnectionService } from '../core/connection.service';
import {
  FirmwareImage,
  FirmwareImageError,
  compareVersions,
  formatSize,
  parseFirmwareImage,
  parseVersion,
} from '../core/firmware/firmware-image';
import {
  FirmwareUpdateService,
  UpdatePhase,
  describeBootloaderReason,
} from '../core/firmware/firmware-update.service';
import { ConnectionBannerComponent } from '../shared/connection-banner/connection-banner.component';
import { TranslationKey, t } from '../core/i18n/i18n';
import { TranslatePipe } from '../core/i18n/translate.pipe';

const PHASE_LABELS: Record<UpdatePhase, TranslationKey | null> = {
  idle: null,
  erasing: 'update.phase.erasing',
  sending: 'update.phase.sending',
  verifying: 'update.phase.verifying',
  restarting: 'update.phase.restarting',
  done: 'update.phase.done',
  failed: 'update.phase.failed',
  aborted: 'update.phase.aborted',
};

/**
 * Aktualizacja firmware: wybór pliku .bin z urządzenia (telefon / komputer), sprawdzenie
 * nagłówka, wysyłka przez BLE i restart. Także restart sterownika i tryb ratunkowy.
 */
@Component({
  selector: 'app-update',
  templateUrl: './update.page.html',
  styleUrls: ['./update.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButton,
    IonContent,
    IonIcon,
    IonProgressBar,
    IonSpinner,
    ConnectionBannerComponent,
    TranslatePipe,
  ],
})
export class UpdatePage {
  private readonly alert = inject(AlertController);
  protected readonly connection = inject(ConnectionService);
  protected readonly update = inject(FirmwareUpdateService);

  protected readonly image = signal<FirmwareImage | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly reading = signal(false);

  protected readonly formatSize = formatSize;
  protected readonly describeBootloaderReason = describeBootloaderReason;

  protected readonly phaseLabel = computed(() => {
    const key = PHASE_LABELS[this.update.phase()];
    return key ? t(key) : '';
  });
  protected readonly percent = computed(() => Math.floor(this.update.progress() * 100));
  /** Pasek bez postępu, gdy sterownik pracuje sam (kasowanie, sprawdzanie, restart). */
  protected readonly indeterminate = computed(() =>
    ['erasing', 'verifying', 'restarting'].includes(this.update.phase()),
  );

  /** Wersja z pliku względem zainstalowanej. */
  protected readonly versionNote = computed(() => {
    const image = this.image();
    const info = this.connection.deviceInfo();
    if (!image || !info || info.firmwareVersion === '0.0.0') {
      return null;
    }
    const diff = compareVersions(image.versionParts, parseVersion(info.firmwareVersion));
    return diff === 0
      ? t('update.sameVersion')
      : diff < 0
        ? t('update.olderVersion', { version: info.firmwareVersion })
        : null;
  });

  protected readonly canStart = computed(
    () =>
      this.connection.connected() &&
      !!this.image() &&
      !this.update.running() &&
      !this.update.rebooting(),
  );

  constructor() {
    addIcons({ documentOutline });
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // ten sam plik można wybrać jeszcze raz (np. po przebudowaniu)
    if (!file) {
      return;
    }
    this.reading.set(true);
    this.fileError.set(null);
    this.image.set(null);
    this.update.reset();
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      this.image.set(parseFirmwareImage(file.name, data));
    } catch (error) {
      this.fileError.set(
        error instanceof FirmwareImageError ? error.message : t('update.readError'),
      );
    } finally {
      this.reading.set(false);
    }
  }

  protected async start(): Promise<void> {
    const image = this.image();
    if (!image || !this.canStart()) {
      return;
    }
    const info = this.connection.deviceInfo();
    const confirmed = await this.confirm(
      t('update.confirm.title'),
      t('update.confirm.text', {
        file: image.fileName,
        version: image.version,
        current: info?.firmwareVersion ?? '',
      }),
      t('update.confirm.action'),
    );
    if (confirmed) {
      await this.update.start(image);
    }
  }

  protected abort(): void {
    this.update.abort();
  }

  protected async reboot(toBootloader: boolean): Promise<void> {
    const confirmed = await this.confirm(
      t(toBootloader ? 'update.confirm.recoveryTitle' : 'update.confirm.rebootTitle'),
      t(toBootloader ? 'update.confirm.recoveryText' : 'update.confirm.rebootText'),
      t('update.confirm.rebootAction'),
    );
    if (confirmed) {
      await this.update.reboot(toBootloader);
    }
  }

  private async confirm(header: string, message: string, action: string): Promise<boolean> {
    const alert = await this.alert.create({
      header,
      message,
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: action, role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }
}
