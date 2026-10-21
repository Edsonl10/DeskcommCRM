import { describe, expect, it } from "vitest";
import { BLOCOS_DO_PAINEL, ordemDoPainel, painelDoClienteSchema } from "./painel-do-cliente";

describe("ordem compartilhada do painel", () => {
  it("configuração incompleta recupera blocos novos sem duplicar nem esconder", () => {
    const ordem = ordemDoPainel(["pedidos", "pedidos", "bloco-invalido"]);
    expect(ordem[0]).toBe("pedidos");
    expect([...ordem].sort()).toEqual([...BLOCOS_DO_PAINEL].sort());
    expect(ordemDoPainel(null)).toEqual(BLOCOS_DO_PAINEL);
  });
  it("gravação exige uma permutação completa e não aceita org no corpo", () => {
    expect(
      painelDoClienteSchema.safeParse({ ordem: [...BLOCOS_DO_PAINEL].reverse() }).success,
    ).toBe(true);
    expect(
      painelDoClienteSchema.safeParse({ ordem: BLOCOS_DO_PAINEL.map(() => "contato") }).success,
    ).toBe(false);
    expect(painelDoClienteSchema.safeParse({ ordem: ["contato"] }).success).toBe(false);
    expect(
      painelDoClienteSchema.safeParse({ ordem: BLOCOS_DO_PAINEL, organization_id: "outro" })
        .success,
    ).toBe(false);
  });
});
