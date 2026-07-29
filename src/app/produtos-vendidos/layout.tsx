import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";
import { LogoutButton } from "./logout-button";

/**
 * Layout mínimo do perfil "Visualizador de produtos" — sem menu lateral,
 * sem topbar administrativa. Cabeçalho compacto preto (símbolo DOM +
 * marca + botão Sair), pensado mobile-first. Qualquer usuário autenticado
 * pode abrir esta página (não é exclusiva de products_viewer) — o
 * middleware é quem IMPEDE um viewer de sair daqui pra qualquer outra rota.
 */
export default async function ProdutosVendidosLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-14 items-center justify-between gap-2 bg-black px-3 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoSymbolPath} alt={BRAND.logoAlt} className="size-full object-contain" />
          </span>
          <span className="truncate text-sm font-medium">{BRAND.name}</span>
        </div>
        <LogoutButton />
      </header>
      <main className="flex-1 overflow-y-auto p-3 sm:p-4">{children}</main>
    </div>
  );
}
