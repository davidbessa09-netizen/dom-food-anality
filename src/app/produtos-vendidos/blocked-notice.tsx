"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** Mostra o aviso de acesso negado e limpa o parâmetro da URL — disparado
 * pelo middleware quando um Visualizador de produtos tenta abrir qualquer
 * outra rota (ver src/lib/supabase/middleware.ts). */
export function BlockedNotice() {
  const router = useRouter();

  useEffect(() => {
    toast.error("Você não tem permissão para acessar esta página.");
    router.replace("/produtos-vendidos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
