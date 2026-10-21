/** Texto manual do cadastro, separado dos dados públicos de enriquecimento. */
export const CAMPO_SOBRE_CLIENTE = "__sobre_cliente";
export const MAX_SOBRE_CLIENTE = 5000;

export function sobreCliente(campos: Record<string, unknown> | null | undefined): string {
  const texto = campos?.[CAMPO_SOBRE_CLIENTE];
  return typeof texto === "string" ? texto : "";
}

/** O editor de campos do funil não é dono do resumo manual. */
export function camposComSobreCliente(
  anterior: Record<string, unknown>,
  novos: Record<string, unknown> | undefined,
  texto: string | undefined,
): Record<string, unknown> {
  const campos = { ...(novos ?? anterior) };
  if (texto !== undefined) campos[CAMPO_SOBRE_CLIENTE] = texto;
  else if (CAMPO_SOBRE_CLIENTE in anterior)
    campos[CAMPO_SOBRE_CLIENTE] = anterior[CAMPO_SOBRE_CLIENTE];
  else delete campos[CAMPO_SOBRE_CLIENTE];
  return campos;
}
