import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { row, signed, fetchMedia, chain } = vi.hoisted(() => {
  const row = {
    id: "message",
    type: "document",
    media_mime: "application/zip",
    media_storage_path: "org/conv/id.zip" as string | null,
    media_url: "http://localhost/file.zip",
    channel_session_id: "channel",
    metadata: { media_filename: "produção.cdr" } as Record<string, unknown>,
  };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "eq"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return { row, chain, signed: vi.fn(), fetchMedia: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    from: () => chain,
  }),
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: async () => ({ idioma: "pt-BR" }) }));
vi.mock("@/lib/auth/require-role", () => ({
  orgAtivaDaApi: async () => ({ ok: true, org: { orgId: "org" } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: signed }) },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "test" } }) }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "id",
  DEFAULT_CHANNEL_PROVIDER: "test",
  getAdapter: () => ({ fetchInboundMedia: fetchMedia }),
  resolveSessionRef: () => ({}),
}));

import { GET } from "@/app/api/v1/messages/[id]/media/route";
const get = () =>
  GET(new NextRequest("https://example.test/api/v1/messages/message/media"), {
    params: Promise.resolve({ id: "message" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  row.type = "document";
  row.media_storage_path = "org/conv/id.zip";
  row.metadata = { media_filename: "produção.cdr" };
  signed.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error: null });
  fetchMedia.mockResolvedValue({ buffer: Buffer.from("bytes"), mime: "application/zip" });
});
describe("download com nome original", () => {
  it("assina com nome original e conserva o filtro de organização", async () => {
    const res = await get();
    expect(res.status).toBe(302);
    expect(signed).toHaveBeenCalledWith("org/conv/id.zip", 3600, { download: "produção.cdr" });
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org");
  });
  it("proxy antes da persistência entrega o mesmo nome", async () => {
    row.media_storage_path = null;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''produ%C3%A7%C3%A3o.cdr",
    );
    expect(await res.text()).toBe("bytes");
  });
  it.each(["image", "audio", "video"])("%s permanece inline", async (type) => {
    row.type = type;
    await get();
    expect(signed).toHaveBeenCalledWith("org/conv/id.zip", 3600, undefined);
  });
  it("anexo antigo sem nome mantém o download disponível", async () => {
    row.metadata = {};
    expect((await get()).status).toBe(302);
    expect(signed).toHaveBeenCalledWith("org/conv/id.zip", 3600, undefined);
  });
});
