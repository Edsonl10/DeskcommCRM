import { describe, expect, it, vi } from "vitest";
import { entradaAutomaticaLigada } from "./entrada-automatica";
import { garantirLeadDaConversa } from "./nascimento-do-lead";
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
describe("entrada automática no funil", () => {
  it.each([
    null,
    undefined,
    {},
    { entrada_automatica_funil: true },
    { entrada_automatica_funil: "false" },
  ])("mantém padrão ligado para %j", (settings) => {
    expect(entradaAutomaticaLigada(settings)).toBe(true);
  });
  it("false explícito desliga", () =>
    expect(entradaAutomaticaLigada({ entrada_automatica_funil: false })).toBe(false));
  it("não cria card nem consulta destino quando a organização desliga", async () => {
    const tabelas: string[] = [];
    const rpc = vi.fn();
    const db = {
      rpc,
      from(table: string) {
        tabelas.push(table);
        const q = {
          select: () => q,
          eq: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data:
              table === "contacts"
                ? {}
                : table === "organizations"
                  ? { settings: { entrada_automatica_funil: false } }
                  : null,
            error: null,
          }),
        };
        return q;
      },
    };
    expect(
      await garantirLeadDaConversa(db as never, {
        organizationId: "org",
        contactId: "contact",
        conversationId: "conversation",
        nomeDoContato: "Teste",
      }),
    ).toEqual({ criado: false, motivo: "entrada_automatica_desligada" });
    expect(tabelas).toEqual(["contacts", "crm_leads", "organizations"]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("falha de leitura não ignora decisão da organização", async () => {
  const rpc = vi.fn();
  const db = {
    rpc,
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({
          data: table === "contacts" ? {} : null,
          error: table === "organizations" ? { message: "offline" } : null,
        }),
      };
      return q;
    },
  };
  const resultado = await garantirLeadDaConversa(db as never, {
    organizationId: "org",
    contactId: "contact",
    conversationId: "conversation",
    nomeDoContato: "Teste",
  });
  expect(resultado).toMatchObject({ criado: false, motivo: "erro" });
  expect(rpc).not.toHaveBeenCalled();
});
