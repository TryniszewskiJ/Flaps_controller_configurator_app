import { Injectable, signal } from '@angular/core';
import { baseCommand, commandName, decodePayload, hexByte, toHex } from './protocol/commands';
import { Frame } from './protocol/frame';

export type FrameDirection = 'tx' | 'rx';

export interface FrameLogEntry {
  id: number;
  time: string;
  direction: FrameDirection;
  /** CMD z ramki (odpowiedź z bitem 0x80). */
  command: number;
  /** CMD w hex, np. 0x83. */
  code: string;
  /** Komenda do filtrowania: odpowiedź należy do swojego żądania. */
  baseCommand: number;
  name: string;
  seq: number;
  /** Payload zdekodowany z flaps.proto jako JSON, a gdy się nie da — hex. */
  payload: string;
  decoded: boolean;
}

export const FRAME_LOG_LIMIT = 500;

/** Wysłane i odebrane ramki protokołu (Dev console). */
@Injectable({ providedIn: 'root' })
export class FrameLogService {
  private readonly _entries = signal<FrameLogEntry[]>([]);
  private nextId = 0;

  readonly entries = this._entries.asReadonly();

  add(direction: FrameDirection, frame: Frame): void {
    const json = decodePayload(frame.command, frame.payload);
    const entry: FrameLogEntry = {
      id: this.nextId++,
      time: formatTime(new Date()),
      direction,
      command: frame.command,
      code: hexByte(frame.command),
      baseCommand: baseCommand(frame.command),
      name: commandName(baseCommand(frame.command)),
      seq: frame.seq,
      payload: json ? JSON.stringify(json) : `hex: ${toHex(frame.payload) || '(pusty)'}`,
      decoded: json !== null,
    };

    this._entries.update((entries) => [...entries, entry].slice(-FRAME_LOG_LIMIT));
  }

  clear(): void {
    this._entries.set([]);
  }
}

function formatTime(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}
