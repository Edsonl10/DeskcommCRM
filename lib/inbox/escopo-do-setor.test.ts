import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { departamentosFiltrados, departamentosPermitidosNoInbox } from "./escopo-do-setor";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const organizacao = "11111111-1111-4111-8111-111111111111";
const usuario = "22222222-2222-4222-8222-222222222222";
const setor = "33333333-3333-4333-8333-333333333333";
const eqs: Array<[string, string, unknown]> = [];
let comMembro = true;

beforeEach(() => {
  vi.clearAllMocks();
  eqs.length = 0;
  comMembro = true;
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      const query = {
        select: () => query,
        eq: (coluna: string, valor: unknown) => {
          eqs.push([tabela, coluna, valor]);
          return query;
        },
        in: () => Promise.resolve({ data: [{ id: setor }], error: null }),
        then: (resolve: (resposta: unknown) => unknown) =>
          Promise.resolve({
            data: tabela === "department_members" && comMembro ? [{ department_id: setor }] : [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
  } as never);
});

describe("isolamento da caixa de entrada por departamento", () => {
  it("gestor e supervisor não são restringidos pelo setor", async () => {
    expect(await departamentosPermitidosNoInbox(organizacao, usuario, "manager")).toBeNull();
    expect(await departamentosPermitidosNoInbox(organizacao, usuario, "admin")).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("atendente só recebe setor ativo vinculado ao próprio usuário e organização", async () => {
    expect(await departamentosPermitidosNoInbox(organizacao, usuario, "agent")).toEqual([setor]);
    expect(eqs).toContainEqual(["department_members", "organization_id", organizacao]);
    expect(eqs).toContainEqual(["department_members", "user_id", usuario]);
    expect(eqs).toContainEqual(["departments", "organization_id", organizacao]);
    expect(eqs).toContainEqual(["departments", "is_active", true]);
  });

  it("sem setor não abre acidentalmente a organização inteira", async () => {
    comMembro = false;
    expect(await departamentosPermitidosNoInbox(organizacao, usuario, "agent")).toEqual([]);
    expect(departamentosFiltrados(undefined, [])).toEqual([]);
  });

  it("um filtro manual não amplia a lista além dos setores permitidos", () => {
    expect(departamentosFiltrados(undefined, [setor])).toEqual([setor]);
    expect(departamentosFiltrados(["outro", setor], [setor])).toEqual([setor]);
    expect(departamentosFiltrados(["outro"], [setor])).toEqual([]);
    expect(departamentosFiltrados(undefined, null)).toBeUndefined();
    expect(departamentosFiltrados(["outro"], null)).toEqual(["outro"]);
  });
});
