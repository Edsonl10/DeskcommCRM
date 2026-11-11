import { describe, expect, it } from "vitest";
import { departamentoInicialDoUsuario } from "./departamento-inicial";

const financeiro = "11111111-1111-4111-8111-111111111111";
const comercial = "22222222-2222-4222-8222-222222222222";

describe("departamento inicial do Inbox", () => {
  it("seleciona o único departamento ativo cadastrado para o colaborador", () => {
    expect(departamentoInicialDoUsuario([{ department_id: financeiro }])).toBe(financeiro);
  });

  it("não escolhe aleatoriamente quando o usuário participa de dois setores", () => {
    expect(departamentoInicialDoUsuario([
      { department_id: financeiro },
      { department_id: comercial },
    ])).toBeNull();
  });

  it("não aplica filtro quando não há setor ativo", () => {
    expect(departamentoInicialDoUsuario([])).toBeNull();
    expect(departamentoInicialDoUsuario(null)).toBeNull();
  });

  it("não confunde duas linhas repetidas do mesmo vínculo com dois setores", () => {
    expect(departamentoInicialDoUsuario([
      { department_id: financeiro },
      { department_id: financeiro },
    ])).toBe(financeiro);
  });
});
