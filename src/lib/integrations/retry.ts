// Retentativa com atraso progressivo pra falha transitória de rede/API —
// nunca repete erro definitivo de autenticação (token inválido não vira
// válido tentando de novo).

const AUTH_ERROR_PATTERN = /401|403|unauthoriz|invalid.?token|credencial/i;

export function isDefinitiveAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_ERROR_PATTERN.test(message);
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  /** Injetável pra testar sem esperar de verdade. */
  delay?: (ms: number) => Promise<void>;
}

/** Executa `fn`, tentando novamente até `retries` vezes (atraso progressivo:
 * baseDelayMs, baseDelayMs*2, ...) só para falhas que não sejam de
 * autenticação definitiva. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 500, delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)) } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isDefinitiveAuthError(error) || attempt === retries) throw error;
      await delay(baseDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}
