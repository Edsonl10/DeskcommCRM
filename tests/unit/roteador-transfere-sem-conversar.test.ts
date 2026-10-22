import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn } from "@/lib/agent-engine/agent/inbound-turn";
import { handoffRouterDepartment } from "@/lib/agent-engine/agent/department-handoff";
vi.mock("@/lib/agent-engine/agent/department-handoff", () => ({
  handoffRouterDepartment: vi.fn(),
}));
const ORG = "22222222-2222-4222-8222-222222222222";
const CONTATO = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const SETOR = "55555555-5555-4555-8555-555555555555";
const deps = {
  log: { info() {}, warn() {}, error() {}, debug() {} },
  llmCfg: {},
  crmCfg: {},
  knobs: { maxSteps: 1 },
  clock: () => new Date("2026-10-06T03:00:00Z"),
};
const job = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: ORG,
  contact_id: CONTATO,
  kind: "inbound_turn",
  payload: {},
  attempts: 1,
  claimed_by: "w",
  claimed_at: new Date(),
};
const input = {
  resolvedAgent: {
    config: null,
    humanRouting: true,
    destinationDepartmentId: SETOR,
    routerId: "r",
    intentName: "Cobrança",
    confidence: 0.9,
    outcome: "classified",
  },
  channelSessionId: "66666666-6666-4666-8666-666666666666",
  conversationId: CONVERSA,
  inboundMessageId: "77777777-7777-4777-8777-777777777777",
  buildOpening: () => "",
};
beforeEach(() => vi.clearAllMocks());
describe("turno com destino humano", () => {
  it("transfere mesmo fora da janela de envio, sem modelo de conversa nem envio/funil", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/\b(insert|update|delete)\b/i.test(sql)) throw new Error("unexpected mutation");
      return { rows: [] };
    });
    await runAgentTurn(
      deps as never,
      job as never,
      { query } as never,
      { workerId: "w" },
      input as never,
    );
    expect(handoffRouterDepartment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: ORG,
        leadId: CONTATO,
        conversationId: CONVERSA,
        departmentId: SETOR,
      }),
      expect.anything(),
    );
  });
  it("respeita o silêncio de uma conversa que já está com humanos", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("as handoff") ? [{ handoff: true }] : [],
    }));
    await runAgentTurn(
      deps as never,
      job as never,
      { query } as never,
      { workerId: "w" },
      input as never,
    );
    expect(handoffRouterDepartment).not.toHaveBeenCalled();
  });
  it("destino ausente falha sem iniciar o bot genérico", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await expect(
      runAgentTurn(deps as never, job as never, { query } as never, { workerId: "w" }, {
        ...input,
        resolvedAgent: { ...input.resolvedAgent, destinationDepartmentId: null },
      } as never),
    ).rejects.toThrow("human_router_destination_unavailable");
    expect(handoffRouterDepartment).not.toHaveBeenCalled();
  });
});
