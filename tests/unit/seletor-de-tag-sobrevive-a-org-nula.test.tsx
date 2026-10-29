/** O funil mantém os vocabulários conhecidos durante oscilação da org e permite desfazer uma etiqueta órfã. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ActiveOrg } from "@/lib/auth/types";

const activeOrgRef: { current: ActiveOrg | null } = { current: null };
const tagsRef: { current: string[] } = { current: [] };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: activeOrgRef.current }),
}));
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => ({ data: [] }) };
});
/** Sem orgId (`enabled: !!orgId`) o hook devolve `data: undefined`. */
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: (orgId: string | null) => ({
    data: orgId ? tagsRef.current : undefined,
  }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: (orgId: string | null) => ({
    data: orgId ? tagsRef.current : undefined,
  }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { unassigned: 1 } }),
}));

vi.mock("@/hooks/team/useDepartments", () => ({
  useDepartments: () => ({ data: { data: [] } }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
const GATILHO = "Filtros de conversas";
const base: InboxFiltersValue = { tab: "waiting", search: "", onlyUnread: false };

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  activeOrgRef.current = { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" };
  tagsRef.current = ["urgente", "vip"];
});
afterEach(cleanup);

async function abrir(value = base) {
  const tela = render(<InboxFilters value={value} onChange={() => {}} />);
  await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: GATILHO }));
  return tela;
}

describe("etiquetas no funil com dublês que respeitam orgId", () => {
  it("com org resolvida, oferece as etiquetas conhecidas", async () => {
    await abrir();
    expect(screen.getByRole("button", { name: "urgente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "vip" })).toBeInTheDocument();
  });

  it("vocabulário indefinido com org nula preserva as opções do diálogo", async () => {
    const { rerender } = await abrir();
    activeOrgRef.current = null;
    rerender(<InboxFilters value={{ ...base }} onChange={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "vip" })).toBeInTheDocument();
  });

  it("filtro órfão continua disponível para desmarcar com org nula", async () => {
    const comFiltro: InboxFiltersValue = { ...base, tag: "apagada" };
    const { rerender } = await abrir(comFiltro);
    activeOrgRef.current = null;
    rerender(<InboxFilters value={{ ...comFiltro }} onChange={() => {}} />);
    const orfa = screen.getByRole("button", { name: "apagada" });
    expect(orfa).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup({ delay: null }).click(orfa);
    expect(orfa).toHaveAttribute("aria-pressed", "false");
  });
});
