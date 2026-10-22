import { describe, expect, it, vi } from "vitest";
import type pg from "pg";
vi.mock("@/lib/atendimento/fronteira-server", () => ({
  guardServiceEffect: vi.fn(async () => {}),
}));
vi.mock("@/lib/escalacao/disponibilidade", () => ({
  expectativaDeAtendimento: vi.fn(async () => ({ frase: "Aguarde a equipe." })),
}));
vi.mock("@/lib/leads/agent-activity", () => ({
  emitAgentActivityForContact: vi.fn(async () => true),
}));
vi.mock("@/lib/agent-engine/cron/scheduler", () => ({
  cancelPendingCronsForLead: vi.fn(async () => {}),
}));
import {
  applyRequestHumanHandoff,
  requestHumanHandoffInputSchema,
} from "@/lib/agent-engine/agent/human-handoff";
const ids = { tenantId: "org", conversationId: "conversation", leadId: "contact" };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => log };
const opts = { conversationSummary: "Triagem", log };
describe("passagem por departamento", () => {
  it.each(["Comercial", "Financeiro"])(
    "resolve %s com os identificadores do runtime antes de silenciar",
    async (departamento) => {
      const query = vi.fn(async (_sql: string, _args?: unknown[]) => ({ rows: [], rowCount: 0 }));
      const result = await applyRequestHumanHandoff({ query } as unknown as pg.Pool, ids, opts, {
        departamento,
        por_que: "Triagem",
      });
      expect(result.ok).toBe(true);
      expect(query.mock.calls[0]).toEqual([
        "select public.fn_agent_handoff_department($1,$2,$3,$4)",
        ["org", "conversation", "contact", departamento],
      ]);
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes("update contacts set force_human")),
      ).toBe(true);
    },
  );
  it("sem setor preserva a passagem existente", async () => {
    const query = vi.fn(async (_sql: string, _args?: unknown[]) => ({ rows: [], rowCount: 0 }));
    await applyRequestHumanHandoff({ query } as unknown as pg.Pool, ids, opts, {
      por_que: "Ajuda",
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("fn_agent_handoff_department")),
    ).toBe(false);
  });
  it("destino inválido ou conversa assumida não silencia o contato nem confirma sucesso", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("fn_agent_handoff_department")) throw new Error("conversation_not_available_for_agent");
      return { rows: [], rowCount: 0 };
    });
    await expect(
      applyRequestHumanHandoff({ query } as unknown as pg.Pool, ids, opts, {
        departamento: "Financeiro",
      }),
    ).rejects.toThrow("conversation_not_available_for_agent");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(["", " ", "x".repeat(101)])(
    "rejeita nome inválido sem consultar ou escrever",
    async (departamento) => {
      const query = vi.fn();
      expect(
        (
          await applyRequestHumanHandoff({ query } as unknown as pg.Pool, ids, opts, {
            departamento,
          })
        ).ok,
      ).toBe(false);
      expect(query).not.toHaveBeenCalled();
    },
  );
  it("não aceita trocar organização/conversa pelo payload", () => {
    expect(
      requestHumanHandoffInputSchema.safeParse({
        departamento: "Comercial",
        organization_id: "outra",
      }).success,
    ).toBe(false);
  });
});
