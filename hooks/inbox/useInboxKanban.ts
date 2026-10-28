"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { ConfiguracaoKanban, ContagemKanban } from "@/lib/inbox/kanban";
import type { ConversationsFilters } from "./useConversationsRealtime";
import { serializarFiltrosAvancados } from "@/lib/inbox/filtros-avancados";

export function useInboxKanban(orgId: string | null) {
  return useQuery({
    queryKey: ["inbox-kanban", orgId],
    enabled: !!orgId,
    queryFn: () =>
      apiClient
        .get<{ data: ConfiguracaoKanban }>("/api/v1/settings/inbox-kanban")
        .then((r) => r.data),
  });
}
export function useSalvarBarraKanban() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { departamento_id: string | null; etiquetas: string[] }) =>
      apiClient.patch("/api/v1/settings/inbox-kanban", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox-kanban"] });
    },
    onError: showApiError,
  });
}
export function useContagensKanban(
  orgId: string | null,
  filtros: ConversationsFilters,
  etiquetas: string[],
) {
  const qs = new URLSearchParams();
  serializarFiltrosAvancados(qs, filtros);
  qs.set("kanban_view", filtros.view ?? "active");
  for (const etiqueta of etiquetas) qs.append("kanban_tags", etiqueta);
  for (const tag of typeof filtros.tag === "string" ? [filtros.tag] : (filtros.tag ?? []))
    qs.append("tag", tag);
  if (filtros.tagMode) qs.set("modo", filtros.tagMode);
  if (filtros.search) qs.set("search", filtros.search);
  if (filtros.channel_session_id) qs.set("channel_session_id", filtros.channel_session_id);
  if (filtros.unread) qs.set("unread", "true");
  if (filtros.is_group) qs.set("is_group", "true");
  const params = qs.toString();
  return useQuery({
    queryKey: ["conversation-counts", "kanban", orgId, params],
    enabled: !!orgId && etiquetas.length > 0,
    refetchInterval: 30_000,
    queryFn: () =>
      apiClient
        .get<{ data: { kanban: ContagemKanban[] } }>(`/api/v1/conversations/counts?${params}`)
        .then((r) => r.data.kanban),
  });
}
