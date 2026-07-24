import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Criptografia simétrica (AES-256-GCM) para credenciais de integração
// (ex.: token da Anota AI). Nunca gravamos o valor em texto plano no banco —
// ver SECURITY.md. A chave vem de uma variável de ambiente que só existe no
// servidor, nunca é exposta ao client.

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY não configurada — necessária para armazenar credenciais de integração."
    );
  }
  // Deriva uma chave de 32 bytes a partir do segredo configurado, com salt fixo
  // (aceitável aqui: o segredo em si já deve ter alta entropia).
  return scryptSync(secret, "dom-food-analytics-credentials", 32);
}

/** Retorna "iv:authTag:ciphertext" em hex, tudo em uma única string armazenável. */
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, dataHex] = stored.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Formato inválido de credencial criptografada.");
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
