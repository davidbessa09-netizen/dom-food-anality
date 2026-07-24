"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DateRangePicker({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const initialRange: DateRange | undefined =
    from && to ? { from: new Date(`${from}T00:00:00`), to: new Date(`${to}T00:00:00`) } : undefined;
  const [range, setRange] = useState<DateRange | undefined>(initialRange);

  function applyRange(selected: DateRange | undefined) {
    setRange(selected);
    if (selected?.from && selected?.to) {
      const params = new URLSearchParams(searchParams);
      params.delete("period");
      params.set("from", toDateInputValue(selected.from));
      params.set("to", toDateInputValue(selected.to));
      router.push(`?${params.toString()}`);
      setOpen(false);
    }
  }

  const label =
    from && to
      ? `${new Date(`${from}T00:00:00`).toLocaleDateString("pt-BR")} – ${new Date(`${to}T00:00:00`).toLocaleDateString("pt-BR")}`
      : "Intervalo personalizado";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
        <CalendarIcon className="size-4" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={range}
          onSelect={applyRange}
          numberOfMonths={2}
          defaultMonth={range?.from}
        />
      </PopoverContent>
    </Popover>
  );
}
