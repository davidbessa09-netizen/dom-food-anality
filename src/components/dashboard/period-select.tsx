"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/dates/period";

export function PeriodSelect({ current }: { current: PeriodPreset }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        if (!value) return;
        const params = new URLSearchParams(searchParams);
        params.set("period", value);
        params.delete("from");
        params.delete("to");
        router.push(`?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue>{() => PERIOD_LABELS[current]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PERIOD_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
