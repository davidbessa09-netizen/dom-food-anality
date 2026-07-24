import { z } from "zod";

export const saveAnotaAiCredentialSchema = z.object({
  sales_channel_id: z.string().uuid("Selecione um canal"),
  token: z.string().min(10, "Token muito curto — confira se copiou certo"),
});
export type SaveAnotaAiCredentialInput = z.infer<typeof saveAnotaAiCredentialSchema>;
