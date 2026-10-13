import { z } from "zod";
import { roleAtLeast, type Role } from "@/lib/auth/types";
import type { Comando } from "@/lib/inbox/comando-da-conversa";

/** Autorização por vínculo; nunca é inferida do perfil visual. */
export const inboxPermissionsSchema = z.object({
  all: z.boolean().default(false),
  ai: z.boolean().default(false),
  closed: z.boolean().default(false),
}).strict();
export type InboxPermissions = z.infer<typeof inboxPermissionsSchema>;
export const SEM_PERMISSOES_INBOX: InboxPermissions = { all: false, ai: false, closed: false };
export function lerPermissoesInbox(value: unknown): InboxPermissions {
  const parsed = inboxPermissionsSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...SEM_PERMISSOES_INBOX };
}
export type InboxView = "active" | "waiting" | "ai" | "all" | "closed";
/** O estado calculado prevalece na apresentação; o comando legado continua compatível. */
export function comandoDaVisaoInbox(state: string | undefined, legacy: Comando): Comando {
  if (state === "ai") return { quem: "automatico" };
  if (state === "waiting" || state === "unassigned") return { quem: "aguardando" };
  return legacy;
}
export const INBOX_VIEWS: { value: InboxView; label: string }[] = [
  { value: "active", label: "Ativos" },
  { value: "waiting", label: "Aguardando" },
  { value: "ai", label: "IA" },
  { value: "all", label: "Todos" },
  { value: "closed", label: "Fechadas" },
];
export function permissaoGlobalInbox(role: Role, permissions: unknown, view: "all" | "ai" | "closed"): boolean {
  return roleAtLeast(role, "manager") || lerPermissoesInbox(permissions)[view];
}
export function normalizarVisaoInbox(value: string | null): InboxView {
  if (value === "mine") return "active";
  if (value === "unassigned") return "waiting";
  if (value === "archived") return "closed";
  return INBOX_VIEWS.some((view) => view.value === value) ? value as InboxView : "active";
}

/** Mesma função usada na lista e nas contagens. A RLS permanece obrigatória. */
export function aplicarVisaoInbox<Q extends {
  eq: (column: string, value: string) => Q;
  neq: (column: string, value: string) => Q;
}>(query: Q, view: InboxView, userId: string, role: Role, permissions: unknown): Q {
  let q = view === "all" ? query.neq("inbox_state", "closed") : query.eq("inbox_state", view);
  if (view === "active" || view === "waiting" ||
      (view !== "all" && !permissaoGlobalInbox(role, permissions, view))) {
    q = q.eq("assigned_to_user_id", userId);
  }
  return q;
}
