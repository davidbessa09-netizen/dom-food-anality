"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { RefreshCw } from "lucide-react";

/**
 * Error Boundary da área autenticada — uma falha isolada (menu, avatar,
 * dropdown) nunca deve derrubar a aplicação inteira com uma tela em branco
 * do navegador. Sempre oferece "Tentar novamente" e "Sair", mesmo quando o
 * que quebrou foi o próprio menu que teria o botão de sair.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erro na área autenticada:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Não foi possível carregar esta área</CardTitle>
          <CardDescription>Um erro isolado impediu que esta parte da tela carregasse. Seus dados não foram afetados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" />
            Tentar novamente
          </Button>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
