import { describe, expect, it } from "vitest";
import { INBOX_VIEWS, normalizarVisaoInbox } from "@/lib/inbox/visoes";
import { tabToFilter } from "@/components/inbox/InboxLayout";
import { readFileSync } from "node:fs";
describe("histórico arquivado integra Fechadas", () => {
  it("preserva o link sem oferecer a aba antiga", () => {
    expect(normalizarVisaoInbox("archived")).toBe("closed");
    expect(tabToFilter("archived")).toEqual({view:"closed"});
    expect(INBOX_VIEWS.map(v=>v.label)).not.toContain("Arquivadas");
  });
  it("o banco inclui os três estados históricos e a API preserva o alias", () => {
    const sql=readFileSync("supabase/migrations/20261014001000_9003_inbox_aceite_e_permissoes.sql","utf8");
    expect(sql).toContain("when $1.status in ('closed','archived','resolved') then 'closed'");
    expect(readFileSync("app/api/v1/conversations/counts/route.ts","utf8")).toContain("archived: closed.count");
  });
});
