"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => logout()}>
      <LogOut className="size-4" />
      Sair
    </Button>
  );
}
