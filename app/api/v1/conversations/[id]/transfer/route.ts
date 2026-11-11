import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/transfer — reatribui a conversa a outro
 * atendente. Decisão G1-06d (spec 13 §5): transferência é IMEDIATA, sem etapa
 * de aceite do destino.
 *
 * G3-01: a mudança de dono acontece via rpc `fn_conversation_assign`
 * (migration 0031) — UPDATE de assigned_to_user_id + INSERT do evento
 * `reason='transfer'` em `conversation_assignment_events` na MESMA transação,
 * com `unread_count_for_assignee` re-zerado pro novo dono.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { transferConversationSchema, validateRequest, type TransferConversationInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Conversation } from "@/lib/types/messaging";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const user = authz.user;
  const orgId = authz.org.orgId; // fonte confiável (cookie validado), nunca o body

  let input: TransferConversationInput;
  try {
    input = await validateRequest(transferConversationSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  if (input.department_id) {
    const { data, error } = await supabase.rpc("fn_conversation_assign_department", {
      p_organization_id: orgId,
      p_conversation_id: id,
      p_department_id: input.department_id,
      ...(input.to_user_id ? { p_to_user_id: input.to_user_id } : {}),
    });
    if (error?.code === "42501") return fail("forbidden", t("Sem permissão para transferir este atendimento."), 403, { requestId });
    if (error) return fail("unprocessable_entity", error.message, 422, { requestId });
    const row = data?.[0];
    if (!row) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
    const conv = row as unknown as Conversation;
    if (!input.to_user_id) {
      await supabase.rpc("emit_event", {
        p_event_type: "conversation.department_routing_requested",
        p_entity_kind: "conversation",
        p_entity_id: conv.id,
        p_organization_id: orgId,
        p_payload: { organization_id: orgId, conversation_id: conv.id, department_id: input.department_id },
        p_metadata: { request_id: requestId },
      });
    }
    await audit({
      action: "conversation.transferred",
      actorUserId: user.id,
      organizationId: conv.organization_id,
      resourceType: "conversation",
      resourceId: conv.id,
      requestId,
      metadata: { department_id: input.department_id, ...(input.to_user_id ? { to_user_id: input.to_user_id } : {}), ...(input.reason ? { note: input.reason } : {}) },
    });
    if (input.to_user_id) {
      // Mesmo aviso e histórico da transferência direta. A seleção automática
      // do setor não pode fazer o destinatário perder sua notificação.
      const { error: erroAviso } = await supabase.rpc("emit_event", {
        p_event_type: "conversation.transferred",
        p_entity_kind: "conversation",
        p_entity_id: conv.id,
        p_payload: { assigned_to_user_id: input.to_user_id, transferred_by: user.id },
        p_metadata: { request_id: requestId },
        p_organization_id: conv.organization_id,
      });
      if (erroAviso) console.error("[conversation.transfer] emit_event failed", erroAviso.message);
      await registrarTrocaDeComando({
        supabase,
        organizationId: conv.organization_id,
        conversationId: conv.id,
        contactId: conv.contact_id,
        tipo: "conversation_transferred",
        actor: { type: "user", id: user.id, role: authz.org.role },
        motivo: input.reason?.trim()
          ? `Transferiu a conversa: ${input.reason.trim()}`
          : "Transferiu a conversa para outro atendente",
        payload: { to_user_id: input.to_user_id, department_id: input.department_id },
      });
    }
    return ok(conv, { requestId });
  }

  // Destino tem que ser membro ativo agent+ da MESMA org (a RLS de
  // user_organizations só mostra o próprio membership a um agent — por isso o
  // admin client, filtrado pela org resolvida acima).
  if (isServiceRoleConfigured()) {
    const admin = createAdminClient();
    const { data: member, error: memberErr } = await admin
      .from("user_organizations")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", input.to_user_id!)
      .is("revoked_at", null)
      .maybeSingle();
    if (memberErr) {
      return fail("internal_error", memberErr.message, 500, { requestId });
    }
    if (!member || member.role === "viewer") {
      return fail("unprocessable_entity", t("Destino não é um atendente desta organização."), 422, {
        requestId,
      });
    }
  }

  // A transferência direta antiga alterava só o atendente e deixava
  // assigned_department_id apontando para o setor anterior. Determine o setor
  // ATIVO do destinatário e use a RPC que atualiza responsável + setor
  // atomicamente, preservando o histórico de atribuição.
  const { data: vinculos, error: erroVinculos } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("organization_id", orgId)
    .eq("user_id", input.to_user_id!);
  if (erroVinculos) return fail("internal_error", erroVinculos.message, 500, { requestId });
  const idsVinculados = [...new Set((vinculos ?? []).map((m) => m.department_id))];
  if (!idsVinculados.length) {
    return fail("unprocessable_entity", "O atendente não está vinculado a nenhum departamento. Atualize o cadastro da equipe.", 422, { requestId });
  }

  const { data: setores, error: erroSetores } = await supabase
    .from("departments")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("id", idsVinculados);
  if (erroSetores) return fail("internal_error", erroSetores.message, 500, { requestId });
  if (!setores?.length) {
    return fail("unprocessable_entity", "O atendente não pertence a um departamento ativo.", 422, { requestId });
  }
  if (setores.length > 1) {
    return fail("unprocessable_entity", "Este atendente pertence a mais de um departamento. Selecione o setor de destino.", 422, { requestId });
  }

  const { data, error } = await supabase.rpc("fn_conversation_assign_department", {
    p_organization_id: orgId,
    p_conversation_id: id,
    p_department_id: setores[0]!.id,
    p_to_user_id: input.to_user_id!,
  });

  if (error) {
    if (error.code === "42501") return fail("forbidden", t("Sem permissão para transferir este atendimento."), 403, { requestId });
    return fail("internal_error", error.message, 500, { requestId });
  }
  const row = data?.[0];
  if (!row) {
    return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  }

  const conv = row as unknown as Conversation;

  await audit({
    action: "conversation.transferred",
    actorUserId: user.id,
    organizationId: conv.organization_id,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
    metadata: {
      to_user_id: input.to_user_id!,
      department_id: setores[0]!.id,
      ...(input.reason ? { note: input.reason } : {}),
    },
  });

  // Notificação ao destino (G1-06d): evento no bus; worker/Realtime consome.
  await supabase
    .rpc("emit_event", {
      p_event_type: "conversation.transferred",
      p_entity_kind: "conversation",
      p_entity_id: conv.id,
      p_payload: { assigned_to_user_id: input.to_user_id, transferred_by: user.id },
      p_metadata: { request_id: requestId },
      p_organization_id: conv.organization_id,
    })
    .then(({ error: emitErr }) => {
      if (emitErr) console.error("[conversation.transfer] emit_event failed", emitErr.message);
    });

  // O motivo que a pessoa escreveu ao transferir chega à TELA por aqui. Antes ele
  // ia só para `metadata` do audit log, cuja policy exige `admin` — ou seja,
  // sumia justamente para quem vai continuar o atendimento. O `reason` da
  // atividade é coberto pela cascata de anonimização da LGPD, que é o que
  // permite texto escrito por humano sobre um cliente morar ali.
  await registrarTrocaDeComando({
    supabase,
    organizationId: conv.organization_id,
    conversationId: conv.id,
    contactId: conv.contact_id,
    tipo: "conversation_transferred",
    actor: { type: "user", id: user.id, role: authz.org.role },
    // Canônico em português: quem traduz é a LEITURA (`t(item.reason)`). Ver o
    // bloco "vocabulario de dominio persistido" em `lib/i18n/dicionario.ts`.
    motivo: input.reason?.trim()
      ? `Transferiu a conversa: ${input.reason.trim()}`
      : "Transferiu a conversa para outro atendente",
    payload: { to_user_id: input.to_user_id, department_id: setores[0]!.id },
  });

  return ok(conv, { requestId });
}
