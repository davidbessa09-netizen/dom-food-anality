"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BrandOption {
  id: string;
  name: string;
}

const ALL_BRANDS = "__all__";

export function BrandSelect({ brands, current }: { brands: BrandOption[]; current: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = current ?? ALL_BRANDS;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams);
        if (!v || v === ALL_BRANDS) {
          params.delete("brand");
        } else {
          params.set("brand", v);
        }
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue>
          {() => (value === ALL_BRANDS ? "Todas as marcas" : brands.find((b) => b.id === value)?.name ?? "Todas as marcas")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BRANDS}>Todas as marcas</SelectItem>
        {brands.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
