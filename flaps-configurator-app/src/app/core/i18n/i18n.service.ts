import { DOCUMENT, Injectable, InjectionToken, computed, effect, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { SettingsService } from '../settings.service';
import { LANGUAGES, Language, currentLanguage, setCurrentLanguage, systemLanguage } from './i18n';

/**
 * Czy użytkownik wybiera język (aplikacja użytkownika: polski / angielski). Bez wyboru
 * (aplikacja technika) interfejs jest zawsze po polsku.
 */
export const LANGUAGE_CHOICE = new InjectionToken<boolean>('language choice', {
  providedIn: 'root',
  factory: (): boolean => false,
});

/** Język interfejsu z ustawień aplikacji; przy pierwszym starcie pyta o niego (po angielsku). */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly settings = inject(SettingsService);
  private readonly alerts = inject(AlertController);
  private readonly document = inject(DOCUMENT);

  readonly choice = inject(LANGUAGE_CHOICE);
  readonly language = computed<Language>(() =>
    this.choice ? (this.settings.language() ?? systemLanguage()) : 'pl',
  );
  readonly languages = LANGUAGES;

  private prompted = false;

  constructor() {
    this.apply(this.language());
    effect(() => this.apply(this.language()));
  }

  setLanguage(language: Language): void {
    if (this.choice) {
      this.settings.setLanguage(language);
    }
  }

  /** Raz, przy starcie: okno wyboru języka, jeśli użytkownik jeszcze go nie wybrał. */
  async promptIfNeeded(): Promise<void> {
    if (!this.choice || this.prompted || this.settings.language() !== null) {
      return;
    }
    this.prompted = true;
    const alert = await this.alerts.create({
      header: 'Choose your language',
      backdropDismiss: false,
      inputs: this.languages.map((option) => ({
        type: 'radio' as const,
        label: option.label,
        value: option.value,
        checked: option.value === this.language(),
      })),
      buttons: [{ text: 'OK', role: 'confirm' }],
    });
    await alert.present();
    const { data } = await alert.onDidDismiss<{ values?: Language }>();
    this.setLanguage(data?.values ?? this.language());
  }

  private apply(language: Language): void {
    if (currentLanguage() !== language) {
      setCurrentLanguage(language);
    }
    this.document.documentElement.lang = language;
  }
}
