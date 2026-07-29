import { z } from "zod";

// "identifier" aceita e-mail (equipe administrativa) OU nome de usuário
// (perfis restritos, como Visualizador de produtos — sem e-mail na
// interface) — resolvido pro e-mail sintético certo em resolveLoginEmail().
export const loginSchema = z.object({
  identifier: z.string().min(3, "Informe seu usuário ou e-mail"),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const recoverPasswordSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;
