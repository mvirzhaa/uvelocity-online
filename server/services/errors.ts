export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ServiceError'; }
}
export function assert(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new ServiceError(status, code, message);
}
export function isPgError(error: unknown, code: string): boolean { return !!error && (error as {code?: string}).code === code; }
