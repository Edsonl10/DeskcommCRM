import { z } from "zod";

export const BLOCOS_DO_PAINEL = [
  "contato",
  "sobre_cliente",
  "tags_conversa",
  "demandas",
  "memoria",
  "roteiros",
  "leads",
  "pedidos",
  "atividade",
  "acervo",
] as const;
export type BlocoDoPainel = (typeof BLOCOS_DO_PAINEL)[number];
export const ROTULOS_DO_PAINEL: Record<BlocoDoPainel, string> = {
  contato: "Contato",
  sobre_cliente: "Sobre o Cliente",
  tags_conversa: "Tags da conversa",
  demandas: "Demandas abertas",
  memoria: "Memória do contato",
  roteiros: "Roteiros do contato",
  leads: "Leads recentes",
  pedidos: "Pedidos recentes",
  atividade: "Atividade",
  acervo: "Acervo",
};

export const ordemDoPainelSchema = z
  .array(z.enum(BLOCOS_DO_PAINEL))
  .length(BLOCOS_DO_PAINEL.length)
  .refine((ordem) => new Set(ordem).size === BLOCOS_DO_PAINEL.length);
export const painelDoClienteSchema = z.object({ ordem: ordemDoPainelSchema }).strict();

/** Configuração antiga/incompleta mantém todos os blocos acessíveis. */
export function ordemDoPainel(valor: unknown): BlocoDoPainel[] {
  const lista = Array.isArray(valor) ? valor : [];
  return [
    ...new Set([
      ...lista.filter((id): id is BlocoDoPainel =>
        (BLOCOS_DO_PAINEL as readonly unknown[]).includes(id),
      ),
      ...BLOCOS_DO_PAINEL,
    ]),
  ];
}
