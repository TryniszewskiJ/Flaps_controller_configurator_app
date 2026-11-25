import { Component, inject } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { AutoConnectService } from '../../core/auto-connect.service';
import { TranslationKey, isLanguage } from '../../core/i18n/i18n';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SettingsService, ThemeMode } from '../../core/settings.service';
import { ThemeService } from '../../core/theme.service';
import { ConnectionBannerComponent } from '../connection-banner/connection-banner.component';

/** Ustawienia aplikacji (wspólne dla aplikacji technika i użytkownika), zapisane na urządzeniu. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonToggle,
    ConnectionBannerComponent,
    TranslatePipe,
  ],
})
export class SettingsPage {
  protected readonly settings = inject(SettingsService);
  protected readonly theme = inject(ThemeService);
  protected readonly autoConnect = inject(AutoConnectService);
  protected readonly i18n = inject(I18nService);

  protected readonly themes: { value: ThemeMode; label: TranslationKey }[] = [
    { value: 'system', label: 'settings.theme.system' },
    { value: 'light', label: 'settings.theme.light' },
    { value: 'dark', label: 'settings.theme.dark' },
  ];

  protected onLanguageChange(value: unknown): void {
    if (isLanguage(value)) {
      this.i18n.setLanguage(value);
    }
  }

  protected onThemeChange(value: unknown): void {
    if (value === 'system' || value === 'light' || value === 'dark') {
      this.theme.setMode(value);
    }
  }

  protected onAutoConnectChange(checked: boolean): void {
    this.settings.setAutoConnect(checked);
  }

  /** UID w grupach po 8 znaków — łatwiej porównać z innym ekranem. */
  protected formatUid(uid: string): string {
    return uid.match(/.{1,8}/g)?.join(' ') ?? '';
  }
}
