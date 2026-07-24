import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const recoverPasswordSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;
