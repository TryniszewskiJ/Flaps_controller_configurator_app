import { Directive, ElementRef, afterRenderEffect, inject, input, signal } from '@angular/core';

/** Tyle px od dołu to jeszcze „na dole” (zaokrąglenia, ostatnia linia w połowie). */
const BOTTOM_SLACK_PX = 24;

/**
 * Przewijana lista logu: nowe wpisy przewijają ją na dół tylko wtedy, gdy użytkownik jest na dole.
 * Przewinięta w górę zostaje tam, gdzie ją zostawił. Wartość dyrektywy — zawartość, po której
 * zmianie sprawdzić przewinięcie.
 */
@Directive({
  selector: '[appStickToBottom]',
  exportAs: 'stickToBottom',
  host: { '(scroll)': 'onScroll()' },
})
export class StickToBottomDirective {
  readonly appStickToBottom = input<unknown>();

  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private readonly _atBottom = signal(true);
  /** Lista jest przewinięta do końca i podąża za nowymi wpisami. */
  readonly atBottom = this._atBottom.asReadonly();

  constructor() {
    afterRenderEffect(() => {
      this.appStickToBottom();
      if (this._atBottom()) {
        this.el.scrollTop = this.el.scrollHeight;
      }
    });
  }

  scrollToBottom(): void {
    this._atBottom.set(true);
    this.el.scrollTop = this.el.scrollHeight;
  }

  protected onScroll(): void {
    const { scrollHeight, scrollTop, clientHeight } = this.el;
    this._atBottom.set(scrollHeight - scrollTop - clientHeight <= BOTTOM_SLACK_PX);
  }
}
