import { describe, expect, it, vi } from "vitest";
import { protegerFetchUnitario } from "../setup/fetch-unitario";

describe("testes unitários sem egressos reais", () => {
  it.each(["https://api.anthropic.com/v1/messages", "https://api.openai.com/v1/responses", "https://projeto.supabase.co/rest/v1/contacts", "https://test-placeholder.invalid", "https://localhost.example.com"])("bloqueia %s antes de chamar a rede", async (url) => {
    const rede = vi.fn<typeof fetch>();
    await expect(protegerFetchUnitario(rede)(url)).rejects.toThrow("fetch failed");
    expect(rede).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3000", "http://127.0.0.1:8080", "http://[::1]:3000"])("permite o servidor local %s", async (url) => {
    const rede = vi.fn<typeof fetch>().mockResolvedValue(new Response("local"));
    expect(await (await protegerFetchUnitario(rede)(url)).text()).toBe("local");
    expect(rede).toHaveBeenCalledOnce();
  });
  it("Request também passa pela mesma restrição", async () => {
    const rede = vi.fn<typeof fetch>();
    await expect(protegerFetchUnitario(rede)(new Request("https://api.anthropic.com/v1/messages"))).rejects.toThrow();
    expect(rede).not.toHaveBeenCalled();
  });
});
