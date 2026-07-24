import { z } from "zod";

// z.string().uuid() do Zod exige um dígito de versão RFC 4122 (1-5) no UUID.
// Os IDs de organizações/marcas de demonstração usam o padrão "00000000-...-0011"
// (versão "0"), que é um UUID válido para o Postgres mas rejeitado pela validação
// estrita do Zod. Usamos um formato mais permissivo (8-4-4-4-12 em hexadecimal)
// que aceita qualquer UUID que o Postgres aceitaria.
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidLike = (message: string) => z.string().regex(UUID_FORMAT, message);

export const createCategorySchema = z.object({
  brand_id: uuidLike("Selecione uma marca"),
  canonical_name: z.string().min(2, "Nome muito curto"),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createProductSchema = z.object({
  brand_id: uuidLike("Selecione uma marca"),
  category_id: uuidLike("Categoria inválida").optional().or(z.literal("")),
  canonical_name: z.string().min(2, "Nome muito curto"),
  current_price: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().nonnegative())
    .optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;
