import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const ensure = vi.hoisted(() => vi.fn(async () => "cv-1"));
vi.mock("@/lib/automation/start-conversation", () => ({ ensureConversation: ensure, sessaoProntaParaEnvio: vi.fn(async () => "canal-1") }));
vi.mock("@/lib/users/com-nome-do-atendente", () => ({ comNomeDoAtendente: async (rows: unknown[]) => rows }));
import { openSharedContactConversation } from "./open-shared-contact-conversation";
const input = { contact_id: "contato-1", channel_session_id: "canal-1" };
function client(ocupadas: unknown[], error: unknown = null) {
  const filtros: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const resultado = table === "conversations" ? { data: ocupadas, error } : { data: { id: "contato-1", is_personal: false }, error: null };
    const q = { select: vi.fn(() => q), eq: vi.fn((...args: unknown[]) => { filtros.push(args); return q; }),
      not: vi.fn(() => q), neq: vi.fn(() => q), limit: vi.fn(() => Promise.resolve(resultado)), maybeSingle: vi.fn(async () => resultado) };
    return q;
  });
  return { admin: { from } as unknown as SupabaseClient, filtros };
}
beforeEach(() => vi.clearAllMocks());
describe("abrir contato já atendido", () => {
  it("retorna o responsável antes de abrir e não lê mensagens", async () => {
    const { admin, filtros } = client([{ id: "cv-1", assigned_to_user_id: "outro", assigned_to_user_name: "Maria" }]);
    await expect(openSharedContactConversation(admin, "org-1", input, "eu")).rejects.toMatchObject({ status: 409, code: "state_conflict", message: "Este contato já está em atendimento com Maria." });
    expect(ensure).not.toHaveBeenCalled();
    expect(filtros).toContainEqual(["organization_id", "org-1"]);
    expect(filtros).toContainEqual(["contact_id", "contato-1"]);
    expect(filtros).toContainEqual(["channel_session_id", "canal-1"]);
  });
  it("contato livre segue para a conversa", async () => {
    const { admin } = client([]);
    await expect(openSharedContactConversation(admin, "org-1", input, "eu")).resolves.toEqual({ conversation_id: "cv-1", contact_id: "contato-1" });
    expect(ensure).toHaveBeenCalledTimes(1);
  });
  it("falha da consulta não abre atendimento às cegas", async () => {
    const { admin } = client([], { message: "consulta falhou" });
    await expect(openSharedContactConversation(admin, "org-1", input, "eu")).rejects.toThrow("consulta falhou");
    expect(ensure).not.toHaveBeenCalled();
  });
});
