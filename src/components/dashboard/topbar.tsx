import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth/session";

const ROLE_LABELS: Record<string, string> = {
  admin_geral: "Administrador geral",
  gestor_marca: "Gestor de marca",
  gestor_loja: "Gestor de loja",
  analista: "Analista",
  somente_leitura: "Somente leitura",
};

export function Topbar({ user }: { user: CurrentUser }) {
  const primaryRole = user.memberships[0]?.role;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="text-sm text-muted-foreground">
        {user.email}
        {primaryRole && (
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
            {ROLE_LABELS[primaryRole] ?? primaryRole}
          </span>
        )}
      </div>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm">
          Sair
        </Button>
      </form>
    </header>
  );
}
