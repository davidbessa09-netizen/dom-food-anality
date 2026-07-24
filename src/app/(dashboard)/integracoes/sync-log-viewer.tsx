"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getSyncLogs, type SyncLogRow } from "./actions";

export function SyncLogViewer({ syncJobId }: { syncJobId: string }) {
  const [logs, setLogs] = useState<SyncLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (logs) {
      setLogs(null);
      return;
    }
    setLoading(true);
    try {
      setLogs(await getSyncLogs(syncJobId));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={toggle} disabled={loading}>
        {logs ? "Ocultar logs" : "Ver logs"}
      </Button>
      {logs && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-md border p-2 text-xs">
          {logs.length === 0 && <p className="text-muted-foreground">Sem logs registrados.</p>}
          {logs.map((log, i) => (
            <p key={i} className={log.level === "error" ? "text-destructive" : ""}>
              [{log.level}] {log.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
