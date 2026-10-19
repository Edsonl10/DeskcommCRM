import type { Message } from "@/lib/types/messaging";
import { nomesDosAtendentes } from "./nome-do-atendente";

/** Enriquece apenas linhas já autorizadas pelo client de sessão/RLS.
 * A autoria vem da mensagem, nunca do responsável atual pela conversa.
 * Não exige membership ativo: o histórico de ex-integrantes também tem autor.
 */
export async function comNomesDosEmissores(messages: Message[]): Promise<Message[]> {
  const ids = messages
    .filter((m) => m.direction === "outbound" && ["user", "crm"].includes(m.sent_via))
    .map((m) => m.sent_by_user_id);
  const nomes = await nomesDosAtendentes(ids);
  return messages.map((m) => ({
    ...m,
    sent_by_user_name: m.sent_by_user_id ? nomes.get(m.sent_by_user_id)?.trim() || null : null,
  }));
}
