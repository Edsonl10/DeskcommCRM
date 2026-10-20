import type { QueryClient } from "@tanstack/react-query";

/** Aceita antes de navegar. A RPC de claim só aceita conversa livre ou já nossa. */
export async function iniciarAtendimento(
  conversationId: string,
  qc: QueryClient,
  observada?: { status?: string; service_revision?: number },
): Promise<void> {
  const fechada = observada?.status && ["closed", "archived", "resolved"].includes(observada.status);
  const res = await fetch(`/api/v1/conversations/${conversationId}/${fechada ? "reopen" : "claim"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fechada
      ? { expected_revision: observada.service_revision }
      : { expected_assignee: null }),
  });
  const json = await res.json() as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Não foi possível abrir a conversa.");
  }
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["conversations"] }),
    qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
    qc.invalidateQueries({ queryKey: ["conversation-counts"] }),
    qc.invalidateQueries({ queryKey: ["contacts"] }),
  ]);
}
