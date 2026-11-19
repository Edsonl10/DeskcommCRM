import { nomeDeArquivo } from "@/lib/messaging/media/filename";
import type { WahaPayload } from "@/lib/waha/envelope";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Nome normalizado do canal; o documento NOWEB é reserva quando media.filename vem vazio. */
export function mediaFilenameOf(payload: WahaPayload): string | null {
  const normalizado = nomeDeArquivo(payload.media?.filename) ?? nomeDeArquivo(payload.filename);
  if (normalizado) return normalizado;
  let message = record(payload._data?.message);
  // Os envelopes variam sem mudar o documento. Limite fixo também cobre entrada malformada.
  for (let depth = 0; message && depth < 5; depth++) {
    const doc = record(message.documentMessage);
    const name = nomeDeArquivo(doc?.fileName) ?? nomeDeArquivo(doc?.title);
    if (name) return name;
    const wrapper =
      record(message.documentWithCaptionMessage) ??
      record(message.ephemeralMessage) ??
      record(message.viewOnceMessage) ??
      record(message.viewOnceMessageV2);
    message = record(wrapper?.message);
  }
  return null;
}
