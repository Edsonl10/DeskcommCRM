import { describe, expect, it } from "vitest";
import { aplicarVisaoInbox, comandoDaVisaoInbox, INBOX_VIEWS, lerPermissoesInbox, normalizarVisaoInbox, permissaoGlobalInbox } from "./visoes";

describe("visões do Inbox e autorização individual", () => {
  it("um responsável indicado não troca a apresentação de IA ou de espera por atendimento ativo", () => {
    const legacy = {quem:"humano" as const, userId:"pessoa", nome:"Pessoa"};
    expect(comandoDaVisaoInbox("ai",legacy)).toEqual({quem:"automatico"});
    expect(comandoDaVisaoInbox("waiting",legacy)).toEqual({quem:"aguardando"});
    expect(comandoDaVisaoInbox("closed",legacy)).toEqual(legacy);
  });
  it("ordena as cinco abas e preserva os links antigos", () => {
    expect(INBOX_VIEWS.map(v => v.label)).toEqual(["Ativos", "Aguardando", "IA", "Todos", "Fechadas"]);
    expect([null, "mine", "unassigned", "archived"].map(normalizarVisaoInbox)).toEqual(["active", "active", "waiting", "closed"]);
  });
  it("falha fechada para dados inválidos e configuração visual antiga", () => {
    for (const value of [null, "all", { preset: "completa" }, { all: "true" }]) {
      expect(lerPermissoesInbox(value)).toEqual({ all: false, ai: false, closed: false });
      expect(permissaoGlobalInbox("agent", value, "all")).toBe(false);
    }
  });
  it("as permissões são independentes; gestores têm visão global", () => {
    expect(permissaoGlobalInbox("agent", { ai: true }, "ai")).toBe(true);
    expect(permissaoGlobalInbox("agent", { ai: true }, "closed")).toBe(false);
    expect(permissaoGlobalInbox("viewer", {}, "all")).toBe(false);
    expect(permissaoGlobalInbox("manager", {}, "all")).toBe(true);
    expect(permissaoGlobalInbox("admin", {}, "closed")).toBe(true);
  });
  it("lista e contagem usam o mesmo predicado e Ativos permanece pessoal", () => {
    const calls: unknown[] = [];
    const query = { eq: (key: string, value: string) => { calls.push(["eq", key, value]); return query; },
      neq: (key: string, value: string) => { calls.push(["neq", key, value]); return query; } };
    aplicarVisaoInbox(query, "active", "eu", "admin", {});
    expect(calls).toEqual([["eq", "inbox_state", "active"], ["eq", "assigned_to_user_id", "eu"]]);
    calls.length = 0;
    aplicarVisaoInbox(query, "all", "eu", "agent", { all: true });
    expect(calls).toEqual([["neq", "inbox_state", "closed"]]);
    calls.length = 0;
    aplicarVisaoInbox(query, "ai", "eu", "agent", { all: true });
    expect(calls).toContainEqual(["eq", "assigned_to_user_id", "eu"]);
  });
});
