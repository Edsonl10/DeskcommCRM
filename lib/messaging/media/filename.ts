/** Nome apresentado e usado no download; o identificador do Storage não é o nome do cliente. */
export function nomeDeArquivo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Caminhos e caracteres de controle não podem virar nome de download/cabeçalho.
  const name = value
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, "")
    .trim();
  return name && name !== "." && name !== ".."
    ? Array.from(name).slice(0, 255).join("").toWellFormed()
    : null;
}

/** Fonte única do nome original em messages.metadata, compartilhada pela tela e pelo servidor. */
export function nomeDoAnexo(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return nomeDeArquivo((metadata as Record<string, unknown>).media_filename);
}

/** RFC 5987: mantém acentos sem permitir quebra/injeção de cabeçalho no proxy. */
export function disposicaoDoAnexo(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}
