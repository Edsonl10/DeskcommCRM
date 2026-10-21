import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ordemDoPainel, painelDoClienteSchema } from "@/lib/inbox/painel-do-cliente";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const db = await createClient();
  const { data, error } = await db
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .single();
  if (error || !data)
    return fail(
      "internal_error",
      traduzir("Não foi possível carregar a configuração do painel.", authz.user.idioma),
      500,
      { requestId },
    );
  const settings = data.settings as Record<string, unknown> | null;
  return ok({ ordem: ordemDoPainel(settings?.painel_cliente_ordem) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = painelDoClienteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });

  // RLS de organizations não autoriza update pelo administrador do tenant.
  // O guard acima autoriza; org vem exclusivamente da sessão.
  const db = createAdminClient();
  const orgId = authz.org.orgId;
  const { data: atual, error: readError } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();
  if (readError || !atual) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });
  const settings = (atual.settings ?? {}) as Record<string, unknown>;
  let query = db
    .from("organizations")
    .update({ settings: { ...settings, painel_cliente_ordem: parsed.data.ordem } })
    .eq("id", orgId);
  // Compare-and-set impede apagar uma configuração salva em paralelo.
  query =
    atual.settings === null
      ? query.is("settings", null)
      : query.eq("settings", JSON.stringify(atual.settings));
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });
  if (!data)
    return fail(
      "state_conflict",
      t("A configuração mudou. Reabra o painel e tente novamente."),
      409,
      { requestId },
    );
  void audit({
    action: "settings.client_panel_updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    requestId,
    metadata: { ordem: parsed.data.ordem },
  });
  return ok(parsed.data, { requestId });
}
