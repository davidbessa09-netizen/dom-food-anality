"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NavContent } from "./nav-content";
import type { NavGroup } from "./nav-items";
import { Menu } from "lucide-react";

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Abrir menu de navegação"
        onClick={() => setOpen(true)}
        className="md:hidden"
      >
        <Menu className="size-5" />
      </Button>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="sr-only">DOM Food Analytics</SheetTitle>
          <span className="flex h-10 items-center overflow-hidden rounded-md bg-black px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dom-logo-full.png" alt="DOM — Domínio Digital" className="h-full w-full object-contain" />
          </span>
        </SheetHeader>
        <NavContent groups={groups} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
