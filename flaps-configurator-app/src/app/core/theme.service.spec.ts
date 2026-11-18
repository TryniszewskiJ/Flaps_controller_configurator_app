import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.classList.remove('ion-palette-dark');
  });

  it('toggles the dark palette and remembers the choice', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(root.classList.contains('ion-palette-dark')).toBe(false);

    theme.toggle();
    expect(theme.dark()).toBe(true);
    expect(root.classList.contains('ion-palette-dark')).toBe(true);
    expect(localStorage.getItem('flaps.theme')).toBe('dark');

    theme.toggle();
    expect(root.classList.contains('ion-palette-dark')).toBe(false);
    expect(localStorage.getItem('flaps.theme')).toBe('light');
  });

  it('starts with the remembered theme', () => {
    localStorage.setItem('flaps.theme', 'dark');
    expect(TestBed.inject(ThemeService).dark()).toBe(true);
    expect(root.classList.contains('ion-palette-dark')).toBe(true);
  });
});
