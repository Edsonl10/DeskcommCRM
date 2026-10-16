import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { comNomeDoAtendente } from "@/lib/users/com-nome-do-atendente";
import { ok, fail } from "@/lib/api/wrappers";

/** Só o aviso de ocupação. Nunca retorna mensagens ou dados do contato. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  const admin = createAdminClient();
  const { data: conv, error } = await admin.from("conversations")
    .select("id, contact_id, status, assigned_to_user_id, assigned_to_user_name")
    .eq("organization_id", authz.org.orgId).eq("id", id).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível consultar o atendimento.", 500, { requestId });
  if (!conv) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  // O contato deve ser acessível ao operador, mesmo que a conversa seja privada.
  const supabase = await createClient();
  const { data: contact, error: contactError } = await supabase.from("contacts").select("id")
    .eq("organization_id", authz.org.orgId).eq("id", conv.contact_id).maybeSingle();
  if (contactError) return fail("internal_error", "Não foi possível consultar o contato.", 500, { requestId });
  if (!contact) return fail("not_found", "Contato não encontrado.", 404, { requestId });
  if (!["closed", "archived", "resolved"].includes(conv.status) && conv.assigned_to_user_id && conv.assigned_to_user_id !== authz.user.id) {
    const [row] = await comNomeDoAtendente([conv]);
    const nome = row?.assigned_to_user_name?.trim();
    return fail("state_conflict", nome ? `Este contato já está em atendimento com ${nome}.` : "Este contato já está em atendimento com outro atendente.", 409, { requestId });
  }
  const { data: visible, error: visibleError } = await supabase.from("conversations").select("id")
    .eq("organization_id", authz.org.orgId).eq("id", id).maybeSingle();
  if (visibleError) return fail("internal_error", "Não foi possível consultar o atendimento.", 500, { requestId });
  if (!visible) return fail("not_found", "Conversa não encontrada ou fora do seu acesso.", 404, { requestId });
  return ok({ available: true }, { requestId });
}
