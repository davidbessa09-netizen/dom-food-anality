"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { CategorySelect } from "@/components/dashboard/category-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { SingleSelectFilter } from "./single-select-filter";
import { MultiSelectFilter } from "./multi-select-filter";
import { FilterChips, type ActiveChip } from "./filter-chips";
import { SaveViewButton } from "./save-view-button";
import { CHANNEL_OPTIONS, COMPARISON_OPTIONS, FULFILLMENT_OPTIONS, ORDER_STATUS_OPTIONS } from "@/lib/filters/types";
import type { PeriodPreset } from "@/lib/dates/period";

export type FilterField =
  | "brand"
  | "stores"
  | "city"
  | "channel"
  | "period"
  | "compare"
  | "status"
  | "fulfillment"
  | "category";

interface Option {
  id: string;
  name: string;
}

/**
 * Barra de filtros global e reutilizável. Cada tela escolhe quais campos
 * mostrar via `fields` — nenhuma tela é forçada a exibir filtro que não faz
 * sentido pra ela. Todo o estado vive na URL (nunca em memória local), então
 * filtros sobrevivem a navegação entre páginas relacionadas via link.
 */
export function GlobalFilterBar({
  fields,
  brands = [],
  stores = [],
  categories = [],
  cities = [],
  currentBrandId,
  currentStoreIds = [],
  currentCityIds = [],
  currentChannel,
  currentPeriodPreset,
  currentFrom,
  currentTo,
  currentCompare,
  currentStatus,
  currentFulfillment,
  currentCategoryId,
  enableSaveView = true,
}: {
  fields: FilterField[];
  brands?: Option[];
  stores?: Option[];
  categories?: Option[];
  cities?: Option[];
  currentBrandId: string | null;
  currentStoreIds?: string[];
  currentCityIds?: string[];
  currentChannel?: string | null;
  currentPeriodPreset?: PeriodPreset;
  currentFrom?: string;
  currentTo?: string;
  currentCompare?: string | null;
  currentStatus?: string | null;
  currentFulfillment?: string | null;
  currentCategoryId?: string | null;
  enableSaveView?: boolean;
}) {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  // Reseta o indicador de carregamento quando a URL muda — padrão oficial do
  // React de "guardar informação do render anterior" via useState (evita
  // setState dentro de useEffect, e refs não podem ser lidos durante o render).
  const searchParamsString = searchParams.toString();
  const [prevParamsString, setPrevParamsString] = useState(searchParamsString);
  if (prevParamsString !== searchParamsString) {
    setPrevParamsString(searchParamsString);
    if (pending) setPending(false);
  }

  const chips: ActiveChip[] = [];
  if (fields.includes("brand") && currentBrandId) {
    const brand = brands.find((b) => b.id === currentBrandId);
    if (brand) chips.push({ paramKey: "brand", label: `Marca: ${brand.name}` });
  }
  if (fields.includes("stores")) {
    for (const storeId of currentStoreIds) {
      const store = stores.find((s) => s.id === storeId);
      if (store) chips.push({ paramKey: "stores", removeValue: storeId, label: `Loja: ${store.name}` });
    }
  }
  if (fields.includes("city")) {
    for (const cityId of currentCityIds) {
      const city = cities.find((c) => c.id === cityId);
      if (city) chips.push({ paramKey: "city", removeValue: cityId, label: `Cidade: ${city.name}` });
    }
  }
  if (fields.includes("category") && currentCategoryId) {
    const category = categories.find((c) => c.id === currentCategoryId);
    if (category) chips.push({ paramKey: "category", label: `Categoria: ${category.name}` });
  }
  if (fields.includes("channel") && currentChannel) {
    const option = CHANNEL_OPTIONS.find((o) => o.value === currentChannel);
    if (option) chips.push({ paramKey: "channel", label: `Canal: ${option.label}` });
  }
  if (fields.includes("status") && currentStatus) {
    const option = ORDER_STATUS_OPTIONS.find((o) => o.value === currentStatus);
    if (option) chips.push({ paramKey: "status", label: `Status: ${option.label}` });
  }
  if (fields.includes("fulfillment") && currentFulfillment) {
    const option = FULFILLMENT_OPTIONS.find((o) => o.value === currentFulfillment);
    if (option) chips.push({ paramKey: "fulfillment", label: `Tipo: ${option.label}` });
  }
  if (fields.includes("compare") && currentCompare && currentCompare !== "none") {
    const option = COMPARISON_OPTIONS.find((o) => o.value === currentCompare);
    if (option) chips.push({ paramKey: "compare", label: `Comparar: ${option.label}` });
  }
  if ((currentFrom && currentTo) || (currentPeriodPreset && currentPeriodPreset !== "30d")) {
    chips.push({ paramKey: currentFrom ? "from" : "period", label: "Período personalizado ou não padrão" });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {fields.includes("brand") && (
          <BrandSelect brands={brands} current={currentBrandId} />
        )}
        {fields.includes("stores") && (
          <MultiSelectFilter
            paramKey="stores"
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            selected={currentStoreIds}
            placeholder="Lojas"
            searchPlaceholder="Buscar loja..."
            onNavigateStart={() => setPending(true)}
          />
        )}
        {fields.includes("city") && (
          <MultiSelectFilter
            paramKey="city"
            options={cities.map((c) => ({ value: c.id, label: c.name }))}
            selected={currentCityIds}
            placeholder="Cidade"
            searchPlaceholder="Buscar cidade..."
            onNavigateStart={() => setPending(true)}
          />
        )}
        {fields.includes("category") && (
          <CategorySelect categories={categories} current={currentCategoryId ?? null} />
        )}
        {fields.includes("channel") && (
          <SingleSelectFilter
            paramKey="channel"
            options={CHANNEL_OPTIONS}
            current={currentChannel ?? null}
            allLabel="Todos os canais"
            onNavigateStart={() => setPending(true)}
          />
        )}
        {fields.includes("period") && (
          <>
            <PeriodSelect current={currentPeriodPreset ?? "30d"} />
            <DateRangePicker from={currentFrom} to={currentTo} />
          </>
        )}
        {fields.includes("compare") && (
          <SingleSelectFilter
            paramKey="compare"
            options={COMPARISON_OPTIONS}
            current={currentCompare && currentCompare !== "none" ? currentCompare : null}
            allLabel="Sem comparação"
            className="w-56"
            onNavigateStart={() => setPending(true)}
          />
        )}
        {fields.includes("status") && (
          <SingleSelectFilter
            paramKey="status"
            options={ORDER_STATUS_OPTIONS}
            current={currentStatus ?? null}
            allLabel="Todos os status"
            onNavigateStart={() => setPending(true)}
          />
        )}
        {fields.includes("fulfillment") && (
          <SingleSelectFilter
            paramKey="fulfillment"
            options={FULFILLMENT_OPTIONS}
            current={currentFulfillment ?? null}
            allLabel="Todos os tipos"
            onNavigateStart={() => setPending(true)}
          />
        )}
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Recalculando" />}
        {enableSaveView && <SaveViewButton />}
      </div>
      <FilterChips chips={chips} onNavigateStart={() => setPending(true)} />
    </div>
  );
}
