import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface AuditLogInput {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Grava uma linha em `audit_logs`. Nunca inclui valor de credencial/segredo
 * em `metadata` — só identificadores e descrição do que aconteceu (ver
 * SECURITY.md). Falha de gravação de log nunca deve interromper a ação
 * principal, só é registrada no console do servidor.
 */
export async function logAudit(supabase: SupabaseServerClient, input: AuditLogInput): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) {
    console.error("[audit_logs] falha ao gravar log de auditoria:", error.message);
  }
}
