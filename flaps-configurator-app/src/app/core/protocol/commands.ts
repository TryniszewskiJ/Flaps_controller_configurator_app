import {
  create,
  DescMessage,
  fromBinary,
  JsonObject,
  ScalarType,
  toJson,
} from '@bufbuild/protobuf';
import {
  CloseSessionRequestSchema,
  CloseSessionResponseSchema,
  Command,
  ErrorResponseSchema,
  GetConfigurationRequestSchema,
  GetConfigurationResponseSchema,
  GetDeviceInfoRequestSchema,
  GetDeviceInfoResponseSchema,
  GetStateRequestSchema,
  GetStateResponseSchema,
  PingRequestSchema,
  PingResponseSchema,
  SaveConfigurationRequestSchema,
  SaveConfigurationResponseSchema,
  SetConfigurationRequestSchema,
  SetConfigurationResponseSchema,
  SetDevModeRequestSchema,
  SetDevModeResponseSchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
} from './gen/flaps_pb';

export const RESPONSE_BIT = 0x80;

interface CommandSchemas {
  request: DescMessage;
  response: DescMessage;
}

/** Modele żądania i odpowiedzi każdej komendy (tabela komend w README firmware). */
export const COMMAND_SCHEMAS: Partial<Record<Command, CommandSchemas>> = {
  [Command.START_SESSION]: {
    request: StartSessionRequestSchema,
    response: StartSessionResponseSchema,
  },
  [Command.GET_DEVICE_INFO]: {
    request: GetDeviceInfoRequestSchema,
    response: GetDeviceInfoResponseSchema,
  },
  [Command.PING]: { request: PingRequestSchema, response: PingResponseSchema },
  [Command.CLOSE_SESSION]: {
    request: CloseSessionRequestSchema,
    response: CloseSessionResponseSchema,
  },
  [Command.GET_CONFIGURATION]: {
    request: GetConfigurationRequestSchema,
    response: GetConfigurationResponseSchema,
  },
  [Command.SET_CONFIGURATION]: {
    request: SetConfigurationRequestSchema,
    response: SetConfigurationResponseSchema,
  },
  [Command.SAVE_CONFIGURATION]: {
    request: SaveConfigurationRequestSchema,
    response: SaveConfigurationResponseSchema,
  },
  [Command.GET_STATE]: { request: GetStateRequestSchema, response: GetStateResponseSchema },
  [Command.SET_DEV_MODE]: {
    request: SetDevModeRequestSchema,
    response: SetDevModeResponseSchema,
  },
};

/** Komendy, które aplikacja może wysłać (do podpowiedzi i filtra). */
export const REQUEST_COMMANDS = Object.keys(COMMAND_SCHEMAS).map(Number) as Command[];

/**
 * Komenda, do której należy ramka: odpowiedź (0x81) -> żądanie (0x01).
 * ERROR i wiadomości bez żądania (0x70–0x7F) zostają sobą.
 */
export function baseCommand(command: number): number {
  if (command === Command.ERROR) {
    return command;
  }
  return command & ~RESPONSE_BIT;
}

export function commandName(command: number): string {
  const name = Command[command] as string | undefined;
  return name && command !== Command.UNSPECIFIED ? name : hexByte(command);
}

/** Komenda po nazwie (PING, ping) albo numerze (0x03, 3). */
export function parseCommand(text: string): Command | null {
  const value = /^(0x[0-9a-f]+|\d+)$/i.test(text)
    ? Number(text)
    : (Command as unknown as Record<string, number | undefined>)[text.toUpperCase()];
  return value !== undefined && COMMAND_SCHEMAS[value as Command] ? (value as Command) : null;
}

/**
 * Payload ramki jako JSON według modelu z flaps.proto (żądanie, odpowiedź albo ErrorResponse).
 * Null, gdy komenda jest nieznana albo payload nie pasuje do modelu.
 */
export function decodePayload(command: number, payload: Uint8Array): JsonObject | null {
  const schema = payloadSchema(command);
  if (!schema) {
    return null;
  }
  try {
    return messageToJson(schema, fromBinary(schema, payload));
  } catch {
    return null;
  }
}

/** Komenda do wpisania w konsoli: nazwa i JSON z wszystkimi polami modelu żądania. */
export function commandTemplate(command: Command): string {
  const schemas = COMMAND_SCHEMAS[command];
  const name = commandName(command);
  if (!schemas || schemas.request.fields.length === 0) {
    return name;
  }
  return `${name} ${JSON.stringify(messageToJson(schemas.request, create(schemas.request)))}`;
}

export function hexByte(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function toHex(bytes: Uint8Array, separator = ' '): string {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(
    separator,
  );
}

function payloadSchema(command: number): DescMessage | null {
  if (command === Command.ERROR) {
    return ErrorResponseSchema;
  }
  const schemas = COMMAND_SCHEMAS[baseCommand(command) as Command];
  if (!schemas) {
    return null;
  }
  return command & RESPONSE_BIT ? schemas.response : schemas.request;
}

/**
 * JSON z wszystkimi polami (także zerowymi, które protobuf pomija w kodowaniu)
 * i polami bytes w hex zamiast base64 — czytelniej przy UID.
 */
function messageToJson<T extends DescMessage>(
  schema: T,
  message: Parameters<typeof toJson<T>>[1],
): JsonObject {
  const json = toJson(schema, message, { alwaysEmitImplicit: true }) as JsonObject;
  const fields = message as unknown as Record<string, unknown>;

  for (const field of schema.fields) {
    if (field.fieldKind === 'scalar' && field.scalar === ScalarType.BYTES) {
      json[field.jsonName] = toHex(fields[field.localName] as Uint8Array, '');
    }
  }
  return json;
}
