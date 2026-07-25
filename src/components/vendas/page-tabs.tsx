import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PageTabItem {
  value: string;
  label: string;
}

/**
 * Abas orientadas por URL (?tab=) em vez de estado de cliente — cada aba é
 * um link real, então dá pra compartilhar/recarregar numa aba específica, e
 * a query string continua sendo a única fonte de verdade (mesmo padrão dos
 * outros filtros do app).
 */
export function PageTabs({
  tabs,
  current,
  buildHref,
}: {
  tabs: PageTabItem[];
  current: string;
  buildHref: (value: string) => string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={buildHref(tab.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            current === tab.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
