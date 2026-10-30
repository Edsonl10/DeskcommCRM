import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { barraKanbanSchema, barrasKanban } from "@/lib/inbox/kanban";
import { departamentosPermitidosNoInbox } from "@/lib/inbox/escopo-do-setor";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!auth.ok) return auth.response;
  const db = await createClient();
  const [org, departamentos] = await Promise.all([
    db.from("organizations").select("settings").eq("id", auth.org.orgId).single(),
    db
      .from("departments")
      .select("id,name")
      .eq("organization_id", auth.org.orgId)
      .eq("is_active", true)
      .order("name"),
  ]);
  if (org.error || departamentos.error)
    return fail("internal_error", "Não foi possível carregar a barra de etiquetas.", 500, {
      requestId,
    });
  let permitidos: string[] | null;
  try {
    permitidos = await departamentosPermitidosNoInbox(auth.org.orgId, auth.user.id, auth.org.role);
  } catch {
    return fail("internal_error", "Não foi possível verificar o departamento do usuário.", 500, {
      requestId,
    });
  }
  const setoresDoAtendente = permitidos;
  const visiveis = (departamentos.data ?? []).filter(
    (d) => setoresDoAtendente === null || setoresDoAtendente.includes(d.id),
  );
  const todasAsBarras = barrasKanban(org.data?.settings);
  const barras = setoresDoAtendente === null
    ? todasAsBarras
    : Object.fromEntries(
        Object.entries(todasAsBarras).filter(([id]) => setoresDoAtendente.includes(id)),
      );
  return ok({ barras, departamentos: visiveis }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "organizations" });
  if (!auth.ok) return auth.response;
  const input = barraKanbanSchema.safeParse(await req.json().catch(() => null));
  if (!input.success)
    return fail("validation_failed", "Confira as etiquetas da barra.", 422, { requestId });
  const { departamento_id, etiquetas } = input.data;
  const db = createAdminClient();
  const orgId = auth.org.orgId;
  if (departamento_id) {
    const departamento = await db
      .from("departments")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", departamento_id)
      .eq("is_active", true)
      .maybeSingle();
    if (departamento.error)
      return fail("internal_error", "Não foi possível conferir o departamento.", 500, {
        requestId,
      });
    if (!departamento.data)
      return fail("not_found", "Departamento não encontrado.", 404, { requestId });
  }
  const atual = await db.from("organizations").select("settings").eq("id", orgId).single();
  if (atual.error || !atual.data)
    return fail("internal_error", "Falha ao salvar.", 500, { requestId });
  const settings = (atual.data.settings ?? {}) as Record<string, unknown>;
  const barras = { ...barrasKanban(settings), [departamento_id ?? "padrao"]: etiquetas };
  let query = db
    .from("organizations")
    .update({ settings: { ...settings, inbox_kanban_barras: barras } })
    .eq("id", orgId);
  query =
    atual.data.settings === null
      ? query.is("settings", null)
      : query.eq("settings", JSON.stringify(atual.data.settings));
  const result = await query.select("id").maybeSingle();
  if (result.error) return fail("internal_error", "Falha ao salvar.", 500, { requestId });
  if (!result.data)
    return fail("state_conflict", "A configuração mudou. Reabra e tente novamente.", 409, {
      requestId,
    });
  void audit({
    action: "settings.inbox_kanban_updated",
    actorUserId: auth.user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    requestId,
    metadata: input.data,
  });
  return ok({ barras }, { requestId });
}
