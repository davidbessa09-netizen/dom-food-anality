import { createHash } from "crypto";

/** Mantém só os dígitos de um telefone, para hash/comparação estáveis. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** (48) 9****-1234 — mostra DDD e os 4 últimos dígitos, mascara o resto. */
export function maskPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length < 8) return "****";
  const ddd = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  return `(${ddd}) ****-${last4}`;
}

/** j***@dominio.com — mostra a primeira letra e o domínio, mascara o resto do usuário. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "****";
  return `${user.slice(0, 1)}***@${domain}`;
}
