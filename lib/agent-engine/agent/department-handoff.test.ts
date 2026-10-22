import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyRequestHumanHandoff } from "./human-handoff";
import { handoffRouterDepartment } from "./department-handoff";
vi.mock("./human-handoff", () => ({ applyRequestHumanHandoff: vi.fn() }));
const input = {
  tenantId: "org",
  leadId: "lead",
  conversationId: "conv",
  departmentId: "dept",
  intentName: "Cobrança",
};
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
beforeEach(() => vi.resetAllMocks());
describe("transferência do roteador pela operação nativa", () => {
  it("revalida setor da organização e entrega o contexto ao handoff existente", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ name: "Financeiro" }] })
      .mockResolvedValueOnce({ rows: [{ body: "segunda via" }] });
    vi.mocked(applyRequestHumanHandoff).mockResolvedValue({ ok: true } as never);
    await handoffRouterDepartment({ query } as never, input, log);
    expect(query.mock.calls[0]?.[1]).toEqual(["org", "dept"]);
    expect(query.mock.calls[1]?.[1]).toEqual(["org", "conv"]);
    expect(applyRequestHumanHandoff).toHaveBeenCalledWith(
      expect.anything(),
      input,
      expect.anything(),
      expect.objectContaining({ departamento: "Financeiro", cliente_quer: "segunda via" }),
    );
  });
  it("setor removido/inativo não transfere nem troca para outro destino", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(handoffRouterDepartment({ query } as never, input, log)).rejects.toThrow(
      "router_department_unavailable",
    );
    expect(applyRequestHumanHandoff).not.toHaveBeenCalled();
  });
  it("rejeição da operação nativa não vira sucesso de triagem", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ name: "Equipe" }] })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(applyRequestHumanHandoff).mockResolvedValue({ ok: false } as never);
    await expect(handoffRouterDepartment({ query } as never, input, log)).rejects.toThrow(
      "router_department_handoff_failed",
    );
  });
});
