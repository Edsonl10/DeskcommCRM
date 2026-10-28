import { z } from "zod";

export const ETIQUETAS_KANBAN_PADRAO = [
  "aguardando",
  "em andamento",
  "proposta enviada",
  "fechado",
];
export const CORES_KANBAN_PADRAO: Record<string, string> = {
  aguardando: "#f98219",
  "em andamento": "#0099d5",
  "proposta enviada": "#a4ce32",
  fechado: "#00a651",
};
export const etiquetaKanbanSchema = z.string().trim().toLowerCase().min(1).max(40);
export const etiquetasKanbanSchema = z
  .array(etiquetaKanbanSchema)
  .max(20)
  .refine((tags) => new Set(tags).size === tags.length, "Há etiquetas repetidas.");
export const barraKanbanSchema = z.object({
  departamento_id: z.uuid().nullable(),
  etiquetas: etiquetasKanbanSchema,
});
const barrasSchema = z.record(z.string(), etiquetasKanbanSchema);
export type BarrasKanban = z.infer<typeof barrasSchema>;
export interface ConfiguracaoKanban {
  barras: BarrasKanban;
  departamentos: { id: string; name: string }[];
}
export interface ContagemKanban {
  tag: string;
  total: number;
  novas: number;
}

/** O namespace de settings é interpretado somente neste contrato. [] desliga uma barra. */
export function barrasKanban(settings: unknown): BarrasKanban {
  const valor =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).inbox_kanban_barras
      : undefined;
  return barrasSchema.safeParse(valor).data ?? {};
}
export function etiquetasDaBarra(barras: BarrasKanban, departamentoId: string | null): string[] {
  return (
    (departamentoId ? barras[departamentoId] : undefined) ??
    barras.padrao ??
    ETIQUETAS_KANBAN_PADRAO
  );
}
/** O filtro novo consulta só a conversa. Etiqueta do contato não é etapa do atendimento. */
export function aplicarEtiquetaKanban<Q extends { contains(coluna: string, valores: string[]): Q }>(
  query: Q,
  etiqueta?: string,
): Q {
  return etiqueta ? query.contains("tags", [etiqueta]) : query;
}
