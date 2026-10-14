import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AttendantsClient } from "@/app/app/team/_components/AttendantsClient";
import type { AttendantAvailability } from "@/hooks/team/useAttendants";

const hooks = vi.hoisted(() => ({ mutate: vi.fn(), rows: [] as AttendantAvailability[] }));
const ANA = "11111111-1111-4111-8111-111111111111";
vi.mock("@/hooks/team/useAttendants", () => ({
  useAttendants: () => ({ data: { data: hooks.rows }, isLoading: false, isError: false }),
  useUpdateAvailability: () => ({ mutate: hooks.mutate, isPending: false }),
  useRoutingConfig: () => ({ isLoading: true }),
  useUpdateRouting: () => ({ mutate: vi.fn() }),
}));

function equipe(capacity: number) {
  hooks.rows = [{
    user_id: ANA, role: "agent", name: "Ana", email: null,
    is_available: true, capacity, current_load: 25,
    schedule: { timezone: "America/Sao_Paulo", windows: [] },
    updated_at: null, last_heartbeat_at: null, present: false,
  }];
}

describe("Sem limite na equipe", () => {
  it("o gestor retira o limite pela tela; o retorno gravado elimina o campo e o aviso de capacidade cheia", async () => {
    equipe(5);
    const user = userEvent.setup();
    const view = render(<AttendantsClient canManage />);
    expect(screen.getByRole("spinbutton", { name: "Capacidade de Ana" })).toHaveValue(5);
    await user.click(screen.getByRole("switch", { name: "Sem limite — Ana" }));
    expect(hooks.mutate).toHaveBeenCalledWith({ userId: ANA, patch: { capacity: 0 } });
    equipe(0);
    view.rerender(<AttendantsClient canManage />);
    expect(screen.getByRole("switch", { name: "Sem limite — Ana" })).toBeChecked();
    expect(screen.queryByRole("spinbutton", { name: "Capacidade de Ana" })).not.toBeInTheDocument();
    expect(screen.getByText("25")).not.toHaveClass("text-destructive");
    await user.click(screen.getByRole("switch", { name: "Sem limite — Ana" }));
    expect(hooks.mutate).toHaveBeenLastCalledWith({ userId: ANA, patch: { capacity: 5 } });
  });

  it("atendente sem permissão de gestão vê Sem limite sem poder alterar", () => {
    equipe(0);
    render(<AttendantsClient canManage={false} />);
    expect(screen.getByText("Sem limite")).toBeVisible();
    expect(screen.queryByRole("switch", { name: "Sem limite — Ana" })).not.toBeInTheDocument();
  });
});
