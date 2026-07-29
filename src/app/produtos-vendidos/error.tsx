"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "./logout-button";
import { RefreshCw } from "lucide-react";

export default function ProdutosVendidosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erro em Produtos vendidos:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Não foi possível carregar esta área</CardTitle>
          <CardDescription>Tente novamente em instantes.</CardDescription>
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
