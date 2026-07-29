"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { findActiveGroupLabel, type NavGroup } from "./nav-items";
import { ChevronDown } from "lucide-react";

export function NavContent({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeGroup = findActiveGroupLabel(pathname, groups);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : [groups[0]?.label]));

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
      {groups.map((group) => {
        const isOpen = collapsed || openGroups.has(group.label);
        return (
          <div key={group.label}>
            {!collapsed && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium tracking-wide text-sidebar-foreground/50 uppercase hover:text-sidebar-foreground"
                aria-expanded={isOpen}
              >
                {group.label}
                <ChevronDown className={cn("size-3.5 transition-transform", isOpen ? "rotate-0" : "-rotate-90")} />
              </button>
            )}
            {isOpen && (
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const link = (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "relative flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                        active
                          ? "bg-nav-active-bg font-medium text-nav-active-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0"
                      )}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                    >
                      {active && (
                        <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-nav-active-indicator" aria-hidden="true" />
                      )}
                      <item.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger render={link} />
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
