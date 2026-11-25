import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.classList.remove('ion-palette-dark');
  });

  it('applies the chosen theme and keeps it in the settings', async () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(root.classList.contains('ion-palette-dark')).toBe(false);

    theme.setMode('dark');
    TestBed.tick();
    expect(theme.dark()).toBe(true);
    expect(root.classList.contains('ion-palette-dark')).toBe(true);
    expect(TestBed.inject(SettingsService).theme()).toBe('dark');

    theme.setMode('light');
    TestBed.tick();
    expect(root.classList.contains('ion-palette-dark')).toBe(false);
    expect(root.style.colorScheme).toBe('light');
    await TestBed.inject(SettingsService).flush(); // zapis nie może trafić do następnego testu
  });

  it('starts with the theme from the loaded settings', async () => {
    const settings = TestBed.inject(SettingsService);
    settings.setTheme('dark');
    await settings.flush();

    TestBed.resetTestingModule();
    root.classList.remove('ion-palette-dark');
    await TestBed.inject(SettingsService).load();

    expect(TestBed.inject(ThemeService).dark()).toBe(true);
    expect(root.classList.contains('ion-palette-dark')).toBe(true);
  });
});
