/**
 * As etiquetas agora são escolhidas no funil. O diálogo aberto precisa manter
 * as opções durante a oscilação dos vocabulários de conversa/contato e permitir
 * desfazer filtros órfãos; o modo E/OU deve refletir a escolha aplicada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";
import type { ActiveOrg } from "@/lib/auth/types";

const activeOrgRef: { current: ActiveOrg | null } = { current: null };
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: activeOrgRef.current }),
}));
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => ({ data: [] as ChannelSession[] }) };
});
/** `undefined` = vocabulário em voo (ou chave nova) — não é "zero etiquetas". */
const tagsRef: { current: string[] | undefined } = { current: undefined };
const tagsDoContatoRef: { current: string[] | undefined } = { current: undefined };
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: tagsRef.current }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: tagsDoContatoRef.current }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { fila: 3, mine: 2, all: 5 } }),
}));

vi.mock("@/hooks/team/useDepartments", () => ({
  useDepartments: () => ({ data: { data: [] } }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
const VALUE: InboxFiltersValue = { tab: "waiting", search: "", onlyUnread: false };
const GATILHO = "Filtros de conversas";

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  activeOrgRef.current = { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" };
  tagsRef.current = ["retorno"];
  tagsDoContatoRef.current = ["vip"];
});
afterEach(cleanup);

async function abreOMenu(value = VALUE) {
  const user = userEvent.setup({ delay: null });
  const tela = render(<InboxFilters value={value} onChange={() => {}} />);
  await user.click(screen.getByRole("button", { name: GATILHO }));
  expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
  return tela;
}

describe("as opções do funil sobrevivem à oscilação do vocabulário", () => {
  for (const estado of ["indefinido", "vazio"] as const) {
    it(`vocabulário voltando a ${estado} não apaga as opções do diálogo aberto`, async () => {
      const { rerender } = await abreOMenu();
      expect(screen.getByRole("button", { name: "vip" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "retorno" })).toBeInTheDocument();
      tagsRef.current = estado === "indefinido" ? undefined : [];
      tagsDoContatoRef.current = estado === "indefinido" ? undefined : [];
      rerender(<InboxFilters value={VALUE} onChange={() => {}} />);
      expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "vip" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "retorno" })).toBeInTheDocument();
    });
  }
});

describe("funil sem vocabulário e filtros órfãos", () => {
  it("organização que nunca teve etiqueta mostra a ausência de opções", async () => {
    tagsRef.current = [];
    tagsDoContatoRef.current = [];
    await abreOMenu();
    expect(screen.queryByRole("button", { name: "vip" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Nenhuma opção disponível.").length).toBeGreaterThan(0);
  });

  it("vocabulário em voo ainda permite abrir os demais filtros", async () => {
    tagsRef.current = undefined;
    tagsDoContatoRef.current = undefined;
    await abreOMenu();
    expect(screen.getByRole("checkbox", { name: "Apenas grupos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "vip" })).not.toBeInTheDocument();
  });

  it("etiqueta órfã pode ser desmarcada pelo funil", async () => {
    tagsRef.current = ["retorno"];
    tagsDoContatoRef.current = [];
    await abreOMenu({ ...VALUE, tag: "apagada" });
    const user = userEvent.setup({ delay: null });
    const orfa = screen.getByRole("button", { name: "apagada" });
    expect(orfa).toHaveAttribute("aria-pressed", "true");
    await user.click(orfa);
    expect(orfa).toHaveAttribute("aria-pressed", "false");
  });

  it("uma órfã entre duas etiquetas também pode ser desmarcada", async () => {
    tagsRef.current = ["retorno"];
    tagsDoContatoRef.current = [];
    await abreOMenu({ ...VALUE, tag: ["retorno", "apagada"] });
    expect(screen.getByRole("button", { name: "apagada" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "retorno" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("o modo E/OU aplicado aparece no funil", () => {
  it("com OU ativo, mostra Qualquer uma (OU)", async () => {
    await abreOMenu({ ...VALUE, tag: ["vip", "retorno"], tagMode: "ou" });
    expect(screen.getByRole("combobox", { name: "Combinar etiquetas" })).toHaveTextContent("Qualquer uma (OU)");
  });
  it("sem modo, mostra Todas (E)", async () => {
    await abreOMenu({ ...VALUE, tag: ["vip", "retorno"] });
    expect(screen.getByRole("combobox", { name: "Combinar etiquetas" })).toHaveTextContent("Todas (E)");
  });
});
