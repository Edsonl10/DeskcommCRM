import { describe, expect, it } from "vitest";
import { disposicaoDoAnexo, nomeDeArquivo, nomeDoAnexo } from "./filename";

describe("nome original do anexo", () => {
  it("preserva extensão e acentos mesmo com MIME de ZIP", () => {
    expect(nomeDoAnexo({ media_filename: "adesivo - produção.cdr", media_status: "stored" })).toBe(
      "adesivo - produção.cdr",
    );
  });
  it.each([null, {}, [], 42, "", "   ", ".", ".."])("ignora nome inválido %j", (v) => {
    expect(nomeDeArquivo(v)).toBeNull();
  });
  it("remove caminho, controles e direção de texto sem descartar extensão", () => {
    expect(nomeDeArquivo("C:\\pasta\\arte\r\n\u202epdf.cdr")).toBe("artepdf.cdr");
    expect(nomeDeArquivo("/tmp/arte.pdf")).toBe("arte.pdf");
  });
  it("limita o nome por caracteres e não corta um emoji ao meio", () => {
    expect(Array.from(nomeDeArquivo("😀".repeat(300))!)).toHaveLength(255);
  });
  it("codifica o nome no cabeçalho de download", () => {
    expect(disposicaoDoAnexo("produção (1).cdr")).toBe(
      "attachment; filename*=UTF-8''produ%C3%A7%C3%A3o%20%281%29.cdr",
    );
  });
});
