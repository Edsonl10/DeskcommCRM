import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";

vi.mock("./nome-do-atendente", () => ({ nomesDosAtendentes: vi.fn() }));
import { nomesDosAtendentes } from "./nome-do-atendente";
import { comNomesDosEmissores } from "./com-nomes-dos-emissores";

describe("nomes dos emissores no histórico", () => {
  it("resolve pelo autor de cada linha, incluindo ex-integrante; não usa o dono atual", async () => {
    vi.mocked(nomesDosAtendentes).mockResolvedValue(new Map([["anterior", " Maria Teste "], ["atual", "Ana Teste"]]));
    const linhas = [
      { id: "1", direction: "outbound", sent_via: "user", sent_by_user_id: "anterior" },
      { id: "2", direction: "outbound", sent_via: "crm", sent_by_user_id: "atual" },
      { id: "3", direction: "inbound", sent_via: "external_device", sent_by_user_id: null },
    ] as Message[];
    const resultado = await comNomesDosEmissores(linhas);
    expect(nomesDosAtendentes).toHaveBeenCalledWith(["anterior", "atual"]);
    expect(resultado.map((m) => m.sent_by_user_name)).toEqual(["Maria Teste", "Ana Teste", null]);
    expect(resultado.map((m) => m.sent_by_user_id)).toEqual(["anterior", "atual", null]);
    expect(linhas[0]?.sent_by_user_name).toBeUndefined();
  });

  it("não inventa autoria quando o cadastro não está disponível", async () => {
    vi.mocked(nomesDosAtendentes).mockResolvedValue(new Map());
    const resultado = await comNomesDosEmissores([
      { direction: "outbound", sent_via: "user", sent_by_user_id: "apagado" },
      { direction: "outbound", sent_via: "user", sent_by_user_id: null },
    ] as Message[]);
    expect(resultado.map((m) => m.sent_by_user_name)).toEqual([null, null]);
  });
});
