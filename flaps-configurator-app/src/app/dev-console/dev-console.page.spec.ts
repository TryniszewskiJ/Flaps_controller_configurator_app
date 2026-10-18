import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConnectionService } from '../core/connection.service';
import { DevConsolePage } from './dev-console.page';

// Dostęp do chronionych składowych strony na potrzeby testu
interface DevConsoleApi {
  command: WritableSignal<string>;
  send(): void;
}

describe('DevConsolePage', () => {
  let fixture: ComponentFixture<DevConsolePage>;
  let page: DevConsoleApi;

  const logLines = (): NodeListOf<HTMLElement> =>
    fixture.nativeElement.querySelectorAll('.log-line');

  beforeEach(() => {
    fixture = TestBed.createComponent(DevConsolePage);
    page = fixture.componentInstance as unknown as DevConsoleApi;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('does not send while disconnected', () => {
    page.command.set('PING');
    page.send();
    fixture.detectChanges();

    expect(logLines().length).toBe(0);
  });

  it('logs the sent command when connected', async () => {
    await TestBed.inject(ConnectionService).connect();
    page.command.set('PING');
    page.send();
    fixture.detectChanges();

    expect(logLines().length).toBe(1);
    expect(logLines()[0].textContent).toContain('TX');
    expect(logLines()[0].textContent).toContain('PING');
  });
});
