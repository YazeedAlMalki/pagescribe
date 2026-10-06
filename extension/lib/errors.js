export class ConversionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
  }
}

export function errorInfo(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'CONVERSION_FAILED',
    message: String(error?.message || error || 'An unexpected error occurred.').slice(0, 1000)
  };
}
