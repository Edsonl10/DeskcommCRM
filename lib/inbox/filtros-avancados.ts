import { z } from "zod";

export const camposDosFiltrosAvancados = {
  department_ids: z.array(z.string().uuid()).max(50).optional(),
  assigned_user_ids: z.array(z.string().uuid()).max(50).optional(),
  last_message_from: z.iso.datetime({ offset: true }).optional(),
  last_message_before: z.iso.datetime({ offset: true }).optional(),
};

export interface FiltrosAvancados {
  department_ids?: readonly string[];
  assigned_user_ids?: readonly string[];
  last_message_from?: string;
  last_message_before?: string;
}

export function periodoValido(filtros: FiltrosAvancados): boolean {
  return (
    !filtros.last_message_from ||
    !filtros.last_message_before ||
    Date.parse(filtros.last_message_from) < Date.parse(filtros.last_message_before)
  );
}

export const filtrosAvancadosSchema = z
  .object(camposDosFiltrosAvancados)
  .refine(periodoValido, { message: "Período inválido.", path: ["last_message_before"] });

/** Um único contrato para o WHERE da lista e de todas as contagens. */
export function aplicarFiltrosAvancados<
  Q extends {
    in(coluna: string, valores: readonly string[]): Q;
    gte(coluna: string, valor: string): Q;
    lt(coluna: string, valor: string): Q;
  },
>(query: Q, filtros: FiltrosAvancados): Q {
  let q = query;
  if (filtros.department_ids?.length) q = q.in("assigned_department_id", filtros.department_ids);
  if (filtros.assigned_user_ids?.length) q = q.in("assigned_to_user_id", filtros.assigned_user_ids);
  if (filtros.last_message_from) q = q.gte("last_message_at", filtros.last_message_from);
  if (filtros.last_message_before) q = q.lt("last_message_at", filtros.last_message_before);
  return q;
}

export function serializarFiltrosAvancados(qs: URLSearchParams, filtros: FiltrosAvancados): void {
  for (const id of filtros.department_ids ?? []) qs.append("department_ids", id);
  for (const id of filtros.assigned_user_ids ?? []) qs.append("assigned_user_ids", id);
  if (filtros.last_message_from) qs.set("last_message_from", filtros.last_message_from);
  if (filtros.last_message_before) qs.set("last_message_before", filtros.last_message_before);
}

/** Datas civis no fuso do navegador; fim exclusivo inclui o último dia inteiro. */
export function periodoDasDatas(
  inicio: string,
  fim: string,
): Pick<FiltrosAvancados, "last_message_from" | "last_message_before"> {
  const primeiro = inicio ? new Date(`${inicio}T00:00:00`) : undefined;
  const depois = fim ? new Date(`${fim}T00:00:00`) : undefined;
  if (depois) depois.setDate(depois.getDate() + 1);
  return { last_message_from: primeiro?.toISOString(), last_message_before: depois?.toISOString() };
}
