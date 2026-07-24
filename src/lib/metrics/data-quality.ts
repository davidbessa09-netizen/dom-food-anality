// Detecção de problemas de qualidade de dado (Fase 4) — cada checagem aqui
// é sobre dado que JÁ existe no banco, nunca infere o que "deveria" ser.

export interface CategoryInput {
  id: string;
  brand_id: string;
  canonical_name: string;
}

export interface DuplicateCategoryGroup {
  brandId: string;
  name: string;
  ids: string[];
}

/** Categorias com o mesmo nome (case-insensitive) dentro da mesma marca — geralmente
 * um sinal de que deveriam ter sido mescladas em vez de criadas separadamente. */
export function findDuplicateCategories(categories: CategoryInput[]): DuplicateCategoryGroup[] {
  const byKey = new Map<string, DuplicateCategoryGroup>();

  for (const c of categories) {
    const key = `${c.brand_id}||${c.canonical_name.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) existing.ids.push(c.id);
    else byKey.set(key, { brandId: c.brand_id, name: c.canonical_name, ids: [c.id] });
  }

  return Array.from(byKey.values()).filter((g) => g.ids.length > 1);
}
