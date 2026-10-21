import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { entradaAutomaticaLigada, entradaFunilSchema } from "@/lib/leads/entrada-automatica";
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
      traduzir("Não foi possível carregar a configuração do funil.", authz.user.idioma),
      500,
      { requestId },
    );
  return ok({ entrada_automatica: entradaAutomaticaLigada(data.settings) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = entradaFunilSchema.safeParse(await req.json().catch(() => null));
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
    .update({ settings: { ...settings, entrada_automatica_funil: parsed.data.entrada_automatica } })
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
      t("A configuração mudou. Recarregue a página e tente novamente."),
      409,
      { requestId },
    );
  void audit({
    action: "settings.pipeline_entry_updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    requestId,
    metadata: parsed.data,
  });
  return ok(parsed.data, { requestId });
}
