export type JevtsErrorCode =
  | 'configuration_error' | 'unsupported_reasoning_effort' | 'transport_error'
  | 'http_error' | 'parse_error' | 'validation_error' | 'aborted';

export class JevtsError extends Error {
  name = 'JevtsError';
  constructor(public readonly code: JevtsErrorCode, message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class ConfigurationError extends JevtsError {
  constructor(message: string, cause?: unknown) { super('configuration_error', message, cause); this.name = 'ConfigurationError'; }
}
export class UnsupportedReasoningEffortError extends JevtsError {
  constructor(public readonly effort: string, public readonly api: string) {
    super('unsupported_reasoning_effort', `Reasoning effort "${effort}" is not supported by ${api}.`);
    this.name = 'UnsupportedReasoningEffortError';
  }
}
export class TransportError extends JevtsError {
  constructor(message: string, cause?: unknown) { super('transport_error', message, cause); this.name = 'TransportError'; }
}
export class HttpError extends JevtsError {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super('http_error', message);
    this.name = 'HttpError';
  }
}
export class ParseError extends JevtsError {
  constructor(message: string, cause?: unknown) { super('parse_error', message, cause); this.name = 'ParseError'; }
}
export class ValidationError extends JevtsError {
  constructor(message: string) { super('validation_error', message); this.name = 'ValidationError'; }
}
export class AbortedError extends JevtsError {
  constructor() { super('aborted', 'The request was aborted.'); this.name = 'AbortedError'; }
}
