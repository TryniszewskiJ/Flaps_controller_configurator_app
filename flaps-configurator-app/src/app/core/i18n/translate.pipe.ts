import { Pipe, PipeTransform } from '@angular/core';
import { TranslationKey, TranslationParams, t } from './i18n';

/**
 * `{{ 'dashboard.title' | t }}`, `{{ 'banner.connecting' | t: { name } }}`. Nieczysty: wynik
 * zależy od bieżącego języka (sygnał), nie tylko od klucza.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  transform(key: TranslationKey, params?: TranslationParams): string {
    return t(key, params);
  }
}
