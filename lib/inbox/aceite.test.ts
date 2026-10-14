import { describe, expect, it } from "vitest";
import { temAceiteHumano } from "./aceite";

describe("aceite humano nos consumidores de atendimento", () => {
  it("indicação sem aceite permite IA; aceite registrado mantém o humano", () => {
    const indicada = { assigned_to_user_id: "pessoa", assignee_kind: "user", human_accepted_at: null };
    expect(temAceiteHumano(indicada)).toBe(false);
    expect(temAceiteHumano({ ...indicada, human_accepted_at: "2026-10-13T12:00:00Z" })).toBe(true);
  });
  it("cliente antigo sem o campo não libera uma conversa possivelmente humana", () => {
    expect(temAceiteHumano({ assigned_to_user_id: "pessoa" })).toBe(true);
    expect(temAceiteHumano({ assignee_kind: "user" })).toBe(true);
    expect(temAceiteHumano({ assignee_kind: "ai" })).toBe(false);
  });
});
