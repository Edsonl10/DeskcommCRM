import { z } from "zod";

export const entradaFunilSchema = z.object({ entrada_automatica: z.boolean() }).strict();

/** Só false explícito desliga; instalações existentes mantêm o comportamento. */
export function entradaAutomaticaLigada(settings: unknown): boolean {
  return !(
    settings &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    (settings as Record<string, unknown>).entrada_automatica_funil === false
  );
}
