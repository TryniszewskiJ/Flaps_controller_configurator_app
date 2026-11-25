import { signal } from '@angular/core';
import { en } from './en';
import { pl } from './pl';

export type Language = 'pl' | 'en';
export const LANGUAGES: readonly { value: Language; label: string }[] = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' },
];

export type TranslationKey = keyof typeof pl;
/** Słownik języka: te same klucze co polski. */
export type Translations = Record<TranslationKey, string>;
export type TranslationParams = Record<string, string | number>;

const DICTIONARIES: Record<Language, Translations> = { pl, en };

/**
 * Bieżący język interfejsu — globalny, bo teksty składa też kod poza komponentami (opisy logik,
 * komunikaty błędów). Odczyt w szablonie albo computed() jest reaktywny: po zmianie języka
 * widok przelicza się sam. Ustawia go I18nService (ustawienia aplikacji).
 */
const current = signal<Language>('pl');

export function currentLanguage(): Language {
  return current();
}

export function setCurrentLanguage(language: Language): void {
  current.set(language);
}

/** Tekst w bieżącym języku; {name} w tekście zastępuje params.name. */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const text = DICTIONARIES[current()][key] ?? pl[key] ?? key;
  return params
    ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
    : text;
}

/** Język telefonu / komputera, jeśli go obsługujemy (domyślny przed wyborem przez użytkownika). */
export function systemLanguage(): Language {
  const languages =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return languages.some((language) => language?.toLowerCase().startsWith('pl')) ? 'pl' : 'en';
}

export function isLanguage(value: unknown): value is Language {
  return value === 'pl' || value === 'en';
}
