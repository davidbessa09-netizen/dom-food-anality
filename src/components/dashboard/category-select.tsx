"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryOption {
  id: string;
  name: string;
}

const ALL_CATEGORIES = "__all__";

export function CategorySelect({ categories, current }: { categories: CategoryOption[]; current: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = current ?? ALL_CATEGORIES;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams);
        if (!v || v === ALL_CATEGORIES) {
          params.delete("category");
        } else {
          params.set("category", v);
        }
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue>
          {() =>
            value === ALL_CATEGORIES ? "Todas as categorias" : categories.find((c) => c.id === value)?.name ?? "Todas as categorias"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_CATEGORIES}>Todas as categorias</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
