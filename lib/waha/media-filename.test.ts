import { describe, expect, it } from "vitest";
import { mediaFilenameOf } from "./media-filename";

describe("nome do documento recebido", () => {
  it("lê media.filename em vez da extensão do transporte", () => {
    expect(
      mediaFilenameOf({
        media: { filename: "adesivo recorte - cliente.cdr", mimetype: "application/zip" },
      }),
    ).toBe("adesivo recorte - cliente.cdr");
  });
  it("recupera o documento NOWEB quando o nome normalizado está vazio", () => {
    expect(
      mediaFilenameOf({
        media: { filename: null },
        _data: { message: { documentMessage: { fileName: "arte.pdf" } } },
      }),
    ).toBe("arte.pdf");
  });
  it("lê documento com legenda e wrapper efêmero", () => {
    expect(
      mediaFilenameOf({
        _data: {
          message: {
            ephemeralMessage: {
              message: {
                documentWithCaptionMessage: {
                  message: { documentMessage: { fileName: "arte.cdr" } },
                },
              },
            },
          },
        },
      }),
    ).toBe("arte.cdr");
  });
  it("nome inválido não derruba a mensagem e usa a reserva", () => {
    expect(
      mediaFilenameOf({
        media: { filename: 123 },
        _data: { message: { documentMessage: { title: "arquivo.pdf" } } },
      }),
    ).toBe("arquivo.pdf");
    expect(mediaFilenameOf({ media: { filename: {} }, _data: { message: [] } })).toBeNull();
  });
  it("mantém sem nome o arquivo que não informa um nome", () => {
    expect(mediaFilenameOf({ media: { url: "http://localhost/id.zip" } })).toBeNull();
  });
});
