import { TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { SettingsService } from '../settings.service';
import { en } from './en';
import { currentLanguage, setCurrentLanguage, t } from './i18n';
import { I18nService, LANGUAGE_CHOICE } from './i18n.service';
import { pl } from './pl';

describe('i18n', () => {
  let alertOptions: { inputs?: { value: string; checked: boolean }[]; header?: string } | null;
  let chosen: string | undefined;

  const setUp = (choice: boolean): void => {
    alertOptions = null;
    TestBed.configureTestingModule({
      providers: [
        { provide: LANGUAGE_CHOICE, useValue: choice },
        {
          provide: AlertController,
          useValue: {
            create: (options: typeof alertOptions): Promise<unknown> => {
              alertOptions = options;
              return Promise.resolve({
                present: (): Promise<void> => Promise.resolve(),
                onDidDismiss: (): Promise<unknown> =>
                  Promise.resolve({ data: { values: chosen }, role: 'confirm' }),
              });
            },
          },
        },
      ],
    });
  };

  beforeEach(() => {
    localStorage.clear();
    chosen = undefined;
  });

  afterEach(() => setCurrentLanguage('pl'));

  it('fills in the parameters and has every text in English', () => {
    expect(t('banner.connecting', { name: 'Moje auto' })).toBe('Łączenie z Moje auto…');
    expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
    expect(Object.values(en).every((text) => text.trim().length > 0)).toBe(true);

    setCurrentLanguage('en');
    expect(t('banner.connecting', { name: 'My car' })).toBe('Connecting to My car…');
  });

  it('keeps the technician app in Polish without asking', async () => {
    setUp(false);
    const i18n = TestBed.inject(I18nService);
    TestBed.inject(SettingsService).setLanguage('en');
    TestBed.tick();

    await i18n.promptIfNeeded();

    expect(alertOptions).toBeNull();
    expect(i18n.language()).toBe('pl');
    expect(currentLanguage()).toBe('pl');
  });

  it('asks for the language in English on the first start and remembers it', async () => {
    setUp(true);
    chosen = 'en';
    const i18n = TestBed.inject(I18nService);

    await i18n.promptIfNeeded();
    TestBed.tick();

    expect(alertOptions?.header).toBe('Choose your language');
    expect(alertOptions?.inputs?.map((input) => input.value)).toEqual(['pl', 'en']);
    expect(TestBed.inject(SettingsService).language()).toBe('en');
    expect(currentLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t('tabs.settings')).toBe('Settings');
  });

  it('does not ask again once the language is chosen', async () => {
    setUp(true);
    TestBed.inject(SettingsService).setLanguage('pl');
    const i18n = TestBed.inject(I18nService);

    await i18n.promptIfNeeded();

    expect(alertOptions).toBeNull();
    expect(i18n.language()).toBe('pl');
  });
});
