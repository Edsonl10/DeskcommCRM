/**
 * O setor de entrada da Inbox vem do vínculo autenticado do colaborador.
 *
 * Um único departamento ativo define o padrão. Sem vínculo ou com vários
 * setores não há escolha inequívoca: inicia em "Todos os departamentos"
 * (sem filtro inicial), deixando a seleção manual para gestor/supervisor.
 */
export function departamentoInicialDoUsuario(
  vinculos: readonly { department_id: string }[] | null | undefined,
): string | null {
  const ids = [...new Set((vinculos ?? []).map((m) => m.department_id))];
  return ids.length === 1 ? ids[0]! : null;
}
