import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { iniciarAtendimento } from "./iniciar-atendimento";

afterEach(() => vi.unstubAllGlobals());

it("atualiza lista, ficha, contadores e contato após confirmar o aceite", async () => {
  const qc = new QueryClient();
  const keys = [["conversations", "active"], ["conversation", "conv"], ["conversation-counts", "org"], ["contacts", "org"]];
  for (const key of keys) qc.setQueryData(key, { antigo: true });
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetch);
  await iniciarAtendimento("conv", qc);
  expect(fetch).toHaveBeenCalledWith("/api/v1/conversations/conv/claim", expect.objectContaining({
    method: "POST", body: JSON.stringify({ expected_assignee: null }),
  }));
  for (const key of keys) expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  qc.clear();
});

it("propaga o conflito sem tentar trocar o responsável", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Outro atendente já assumiu." } }) });
  vi.stubGlobal("fetch", fetch);
  const qc = new QueryClient();
  await expect(iniciarAtendimento("conv", qc)).rejects.toThrow("Outro atendente já assumiu.");
  expect(fetch).toHaveBeenCalledTimes(1);
  qc.clear();
});

it("atalho de uma conversa fechada reabre e assume pela revisão observada", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetch);
  const qc = new QueryClient();
  await iniciarAtendimento("conv", qc, { status: "closed", service_revision: 8 });
  expect(fetch).toHaveBeenCalledWith("/api/v1/conversations/conv/reopen", expect.objectContaining({
    method: "POST", body: JSON.stringify({ expected_revision: 8 }),
  }));
  expect(fetch).toHaveBeenCalledTimes(1);
  qc.clear();
});
