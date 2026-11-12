import { describe, expect, it, vi } from "vitest";

import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import nextConfig from "../../next.config";

vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: (config: unknown) => config }));

describe("validateOutboundMedia", () => {
  it("preserva no proxy o multipart de um documento no tamanho máximo aceito", () => {
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(validateOutboundMedia(mime, MAX_MEDIA_BYTES)).toEqual({ ok: true, kind: "document" });
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(
      `${MAX_MEDIA_BYTES / 1_048_576 + 1}mb`,
    );
  });

  it("classifica mimes suportados no kind certo", () => {
    expect(validateOutboundMedia("image/jpeg", 1000)).toEqual({ ok: true, kind: "image" });
    expect(validateOutboundMedia("image/webp", 1000)).toEqual({ ok: true, kind: "image" });
    expect(validateOutboundMedia("video/mp4", 1000)).toEqual({ ok: true, kind: "video" });
    expect(validateOutboundMedia("audio/ogg; codecs=opus", 1000)).toEqual({ ok: true, kind: "audio" });
    expect(validateOutboundMedia("audio/webm", 1000)).toEqual({ ok: true, kind: "audio" });
    expect(validateOutboundMedia("application/pdf", 1000)).toEqual({ ok: true, kind: "document" });
    expect(validateOutboundMedia("text/csv", 1000)).toEqual({ ok: true, kind: "document" });
  });
  it("rejeita mime não suportado", () => {
    const r = validateOutboundMedia("application/x-msdownload", 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported_media_type");
  });
  it("rejeita acima de 50MB", () => {
    const r = validateOutboundMedia("image/jpeg", 51 * 1024 * 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });
  it("rejeita arquivo vazio", () => {
    const r = validateOutboundMedia("image/jpeg", 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("validation_failed");
  });
});
