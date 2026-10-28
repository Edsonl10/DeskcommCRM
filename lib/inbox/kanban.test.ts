import { describe, expect, it, vi } from "vitest";
import {
  aplicarEtiquetaKanban,
  barraKanbanSchema,
  barrasKanban,
  etiquetasDaBarra,
  ETIQUETAS_KANBAN_PADRAO,
} from "./kanban";
const departamento = "22222222-2222-4222-8222-222222222222";
describe("barra Kanban por departamento", () => {
  it("tem as quatro etapas aprovadas e permite ordem própria por departamento", () => {
    expect(etiquetasDaBarra({}, null)).toEqual(ETIQUETAS_KANBAN_PADRAO);
    expect(
      etiquetasDaBarra(
        { padrao: ["aguardando"], [departamento]: ["fechado", "em andamento"] },
        departamento,
      ),
    ).toEqual(["fechado", "em andamento"]);
  });
  it("uma barra vazia é escolha válida e não reaplica o padrão", () => {
    expect(etiquetasDaBarra({ [departamento]: [] }, departamento)).toEqual([]);
  });
  it("lê só o namespace declarado, sem confundir outras configurações", () => {
    expect(barrasKanban({ tags: ["vip"], inbox_kanban_barras: { padrao: ["etapa"] } })).toEqual({
      padrao: ["etapa"],
    });
    expect(barrasKanban({ inbox_kanban_barras: "inválido" })).toEqual({});
  });
  it("valida nomes, duplicações após normalização, limites e departamento", () => {
    expect(
      barraKanbanSchema.parse({ departamento_id: departamento, etiquetas: [" EM ANDAMENTO "] })
        .etiquetas,
    ).toEqual(["em andamento"]);
    for (const etiquetas of [
      [""],
      ["VIP", "vip"],
      ["x".repeat(41)],
      Array.from({ length: 21 }, (_, i) => `etapa-${i}`),
    ])
      expect(
        barraKanbanSchema.safeParse({ departamento_id: departamento, etiquetas }).success,
      ).toBe(false);
    expect(
      barraKanbanSchema.safeParse({ departamento_id: "outra-org", etiquetas: [] }).success,
    ).toBe(false);
  });
  it("filtra a conversa no banco; não consulta etiqueta do contato e não filtra quando desligado", () => {
    const q = { contains: vi.fn(() => q) };
    expect(aplicarEtiquetaKanban(q, "em andamento")).toBe(q);
    expect(q.contains).toHaveBeenCalledExactlyOnceWith("tags", ["em andamento"]);
    q.contains.mockClear();
    expect(aplicarEtiquetaKanban(q)).toBe(q);
    expect(q.contains).not.toHaveBeenCalled();
  });
});
