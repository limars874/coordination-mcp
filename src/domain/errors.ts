export type CoordinationErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'INVALID_REFERENCE'
  | 'SCOPE_MISMATCH'
  | 'IMMUTABLE_FIELD'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class CoordinationError extends Error {
  constructor(
    public readonly code: CoordinationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CoordinationError';
  }
}
