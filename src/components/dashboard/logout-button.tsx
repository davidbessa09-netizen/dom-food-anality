"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

/**
 * Botão de sair independente do menu do perfil — sempre acessível mesmo
 * que o menu (dropdown) tenha algum problema (ver ErrorBoundary do layout
 * autenticado). `logout()` já encerra a sessão no Supabase Auth e
 * redireciona pro /login no servidor.
 */
export function LogoutButton({ variant = "text", className }: { variant?: "text" | "icon"; className?: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      logout();
    });
  }

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sair"
        onClick={handleClick}
        disabled={pending}
        className={cn("text-danger hover:bg-danger/10 hover:text-danger", className)}
      >
        <LogOut className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className={cn("h-auto gap-1 px-2 py-1 text-xs text-danger hover:bg-danger/10 hover:text-danger", className)}
    >
      <LogOut className="size-3.5" />
      {pending ? "Saindo..." : "Sair"}
    </Button>
  );
}
