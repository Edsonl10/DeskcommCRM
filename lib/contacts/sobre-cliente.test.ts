import { describe, expect, it } from "vitest";
import { camposComSobreCliente, sobreCliente, CAMPO_SOBRE_CLIENTE } from "./sobre-cliente";
import { contactPatchSchema } from "@/lib/schemas/contacts";

describe("resumo manual do cliente", () => {
  it("grava só o texto pedido preservando os outros campos", () => {
    const campos = camposComSobreCliente(
      { endereco: "Rua Teste", prazo: 10 },
      undefined,
      "Cliente recorrente",
    );
    expect(campos).toEqual({
      endereco: "Rua Teste",
      prazo: 10,
      [CAMPO_SOBRE_CLIENTE]: "Cliente recorrente",
    });
    expect(sobreCliente(campos)).toBe("Cliente recorrente");
  });
  it("formulário antigo não apaga nem reverte o resumo mais recente", () => {
    expect(
      camposComSobreCliente(
        { [CAMPO_SOBRE_CLIENTE]: "novo" },
        { [CAMPO_SOBRE_CLIENTE]: "antigo", prazo: 20 },
        undefined,
      ),
    ).toEqual({ [CAMPO_SOBRE_CLIENTE]: "novo", prazo: 20 });
  });
  it("limpar o resumo é explícito e não remove os outros campos", () => {
    const campos = camposComSobreCliente(
      { prazo: 10, [CAMPO_SOBRE_CLIENTE]: "antigo" },
      undefined,
      "",
    );
    expect(sobreCliente(campos)).toBe("");
    expect(campos.prazo).toBe(10);
  });
  it("texto fora do limite é recusado na API e espaços são aparados", () => {
    expect(contactPatchSchema.safeParse({ sobre_cliente: "a".repeat(5001) }).success).toBe(false);
    expect(contactPatchSchema.parse({ sobre_cliente: "  recado  " }).sobre_cliente).toBe("recado");
  });
});
