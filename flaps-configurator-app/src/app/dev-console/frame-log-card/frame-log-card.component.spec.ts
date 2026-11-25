import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FrameLogService } from '../../core/frame-log.service';
import { Command, TechnicianCommand } from '../../core/protocol/messages';
import { FrameLogCardComponent } from './frame-log-card.component';

// Dostęp do chronionych składowych na potrzeby testu
interface FrameLogCardApi {
  onFilterChange(value: number[]): void;
  onShowAmpOut(show: boolean): void;
}

const hex = (text: string): Uint8Array =>
  Uint8Array.from(text.split(/\s+/).map((byte) => parseInt(byte, 16)));

describe('FrameLogCardComponent', () => {
  let fixture: ComponentFixture<FrameLogCardComponent>;
  let page: FrameLogCardApi;
  let frameLog: FrameLogService;

  const entries = (): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.log-entry'));

  beforeEach(() => {
    frameLog = TestBed.inject(FrameLogService);
    fixture = TestBed.createComponent(FrameLogCardComponent);
    page = fixture.componentInstance as unknown as FrameLogCardApi;
    fixture.detectChanges();
  });

  it('shows frames as command name and JSON payload', () => {
    frameLog.add('tx', { command: 0x03, seq: 7, payload: new Uint8Array() });
    frameLog.add('rx', { command: 0x81, seq: 1, payload: hex('08 01 10 01 18 01 20 C0 3E') });
    fixture.detectChanges();

    expect(entries()).toHaveLength(2);
    expect(entries()[0].textContent).toContain('PING');
    expect(entries()[0].textContent).toContain('seq 7');
    expect(entries()[1].textContent).toContain('START_SESSION');
    expect(entries()[1].textContent).toContain('0x81');
    expect(entries()[1].textContent).toContain('"sessionTimeoutMs":8000');
  });

  it('filters frames by command, keeping requests with their responses', () => {
    frameLog.add('tx', { command: 0x03, seq: 1, payload: new Uint8Array() });
    frameLog.add('rx', { command: 0x83, seq: 1, payload: new Uint8Array() });
    frameLog.add('tx', { command: 0x02, seq: 2, payload: new Uint8Array() });

    page.onFilterChange([Command.PING]);
    fixture.detectChanges();

    expect(entries()).toHaveLength(2);
    expect(entries().every((entry) => entry.textContent?.includes('PING'))).toBe(true);
  });

  it('hides AMP_OUT frames unless they are switched on', () => {
    const ampOut = { command: TechnicianCommand.AMP_OUT, seq: 0, payload: new Uint8Array() };
    frameLog.add('rx', ampOut);
    fixture.detectChanges();
    expect(entries()).toHaveLength(0);

    page.onShowAmpOut(true);
    frameLog.add('rx', ampOut);
    fixture.detectChanges();
    expect(entries()).toHaveLength(1);
    expect(entries()[0].textContent).toContain('AMP_OUT');

    page.onShowAmpOut(false);
    fixture.detectChanges();
    expect(entries()).toHaveLength(0);
  });
});
