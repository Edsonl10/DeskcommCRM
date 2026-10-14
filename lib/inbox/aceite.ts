/** Dado antigo sem a coluna continua conservador: não libera a IA por omissão. */
export function temAceiteHumano(conversa: {
  human_accepted_at?: string | null;
  assigned_to_user_id?: string | null;
  assignee_kind?: string | null;
}): boolean {
  return conversa.human_accepted_at === undefined
    ? Boolean(conversa.assigned_to_user_id) || conversa.assignee_kind === "user"
    : conversa.human_accepted_at !== null;
}
