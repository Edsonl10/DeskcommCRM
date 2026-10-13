import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
import { InterfaceEditor } from "./InterfaceEditor";
afterEach(cleanup);
it("expõe três permissões independentes dentro da personalização e o preset não as altera", () => {
  const permissions = vi.fn(), appearance = vi.fn();
  const { container } = render(<InterfaceEditor role="agent" value={{ preset: "completa" }} onChange={appearance}
    inboxPermissions={{all: false, ai: false, closed: true}} onInboxPermissionsChange={permissions} />);
  fireEvent.click(screen.getByText("Personalizar áreas visíveis"));
  const all = screen.getByLabelText("Ver Todos — atendimentos em andamento de toda a equipe.");
  expect(all.closest("details")).toBe(container.querySelector("details"));
  fireEvent.click(all);
  expect(permissions).toHaveBeenLastCalledWith({all: true, ai: false, closed: true});
  fireEvent.change(screen.getByLabelText("Perfil de interface"), { target: { value: "simplificada" } });
  expect(appearance).toHaveBeenLastCalledWith({preset:"simplificada"});
  expect(permissions).toHaveBeenCalledTimes(1);
});
it("explica a visão global implícita de gestores sem oferecer desligá-la", () => {
  render(<InterfaceEditor role="manager" value={{preset:"completa"}} onChange={vi.fn()} onInboxPermissionsChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Personalizar áreas visíveis"));
  for (const label of ["Ver Todos — atendimentos em andamento de toda a equipe.", "Ver IA de toda a equipe.", "Ver Fechadas de toda a equipe."]) {
    expect(screen.getByLabelText(label)).toBeChecked();
    expect(screen.getByLabelText(label)).toBeDisabled();
  }
});
