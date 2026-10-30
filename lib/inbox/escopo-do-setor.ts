import { roleAtLeast, type Role } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * null = gestor/supervisor sem limite de departamento.
 * [] = usuário operacional sem setor ativo: negar acesso, jamais retornar a organização inteira.
 * O vínculo vem da sessão autenticada e é sempre recortado por organização.
 */
export async function departamentosPermitidosNoInbox(
  organizationId: string,
  userId: string,
  role: Role,
): Promise<string[] | null> {
  if (roleAtLeast(role, "manager")) return null;

  const db = createAdminClient();
  const { data: membros, error: erroMembros } = await db
    .from("department_members")
    .select("department_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (erroMembros) throw new Error("Não foi possível verificar os setores do atendente.");

  const ids = [...new Set((membros ?? []).map((m) => m.department_id))];
  if (!ids.length) return [];

  const { data: ativos, error: erroAtivos } = await db
    .from("departments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", ids);
  if (erroAtivos) throw new Error("Não foi possível verificar os setores ativos.");
  return (ativos ?? []).map((d) => d.id);
}

/** O filtro solicitado só pode REDUZIR o escopo autenticado, nunca ampliá-lo. */
export function departamentosFiltrados(
  solicitados: readonly string[] | undefined,
  permitidos: readonly string[] | null,
): string[] | undefined {
  if (permitidos === null) return solicitados ? [...solicitados] : undefined;
  if (!solicitados?.length) return [...permitidos];
  return solicitados.filter((id) => permitidos.includes(id));
}
