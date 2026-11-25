import { Injectable, inject } from '@angular/core';
import { fromJson, JsonValue } from '@bufbuild/protobuf';
import { ConnectionService } from './connection.service';
import { COMMAND_SCHEMAS } from './protocol/commands';

/** Komenda wpisana w Dev console (aplikacja technika) — dowolna z protokołu. */
@Injectable({ providedIn: 'root' })
export class DevCommandService {
  private readonly connection = inject(ConnectionService);

  /**
   * Payload JSON w formacie modelu żądania z flaps*.proto. Odpowiedź widać w logu ramek;
   * tu tylko błąd (brak połączenia, zły JSON, ERROR, timeout).
   */
  async send(command: number, payload: JsonValue = {}): Promise<void> {
    const schemas = COMMAND_SCHEMAS[command];
    if (!this.connection.connected()) {
      throw new Error('Brak połączenia z urządzeniem.');
    }
    if (!schemas) {
      throw new Error(`Nieznana komenda ${command}.`);
    }

    const request = fromJson(schemas.request, payload);
    await this.connection.request(command, schemas.request, request, schemas.response, {
      retries: 0,
    });
  }
}
