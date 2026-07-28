"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "dom-hide-values";

interface PrivacyContextValue {
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({ hidden: false, toggle: () => {} });

/** Preferência de "ocultar valores" — vale só pra sessão do navegador
 * (sessionStorage), pensada pra reuniões, capturas de tela e uso em locais
 * públicos. Começa sempre visível (mesmo valor no servidor e no primeiro
 * render do cliente) e só lê o sessionStorage depois de montar, pra não
 * gerar divergência de hidratação. */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") setHidden(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function toggle() {
    setHidden((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

export function PrivacyToggleButton() {
  const { hidden, toggle } = usePrivacy();
  return (
    <Button variant="outline" size="sm" onClick={toggle}>
      {hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {hidden ? "Mostrar valores" : "Ocultar valores"}
    </Button>
  );
}

/** Mascara um valor formatado (ex.: "R$ 1.234,56") preservando o prefixo não
 * numérico — vira "R$ ••••••". Fora do modo oculto, renderiza o valor real. */
export function Sensitive({ value }: { value: string }) {
  const { hidden } = usePrivacy();
  if (!hidden) return <>{value}</>;
  const match = value.match(/^(\D*)/);
  const prefix = match ? match[1] : "";
  return (
    <>
      {prefix}••••••
    </>
  );
}
