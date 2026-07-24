"use server";

import { createClient } from "@/lib/supabase/server";
import { recoverPasswordSchema } from "@/lib/validations/auth";

export interface RecoverState {
  message?: string;
  error?: string;
}

export async function recoverPassword(
  _prevState: RecoverState,
  formData: FormData
): Promise<RecoverState> {
  const parsed = recoverPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  if (error) {
    return { error: "Não foi possível enviar o e-mail de recuperação." };
  }

  return { message: "Se o e-mail existir em nossa base, você receberá um link de redefinição." };
}
