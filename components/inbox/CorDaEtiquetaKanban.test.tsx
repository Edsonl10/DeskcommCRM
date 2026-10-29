import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CorDaEtiquetaKanban } from "./CorDaEtiquetaKanban";

const { post, invalidar, mostrarErro, corAtual } = vi.hoisted(() => ({
  post: vi.fn(),
  invalidar: vi.fn(),
  mostrarErro: vi.fn(),
  corAtual: { value: null as string | null },
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { post } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: mostrarErro }));
vi.mock("@/components/tags/CoresDasEtiquetas", () => ({
  useCorDaEtiqueta: () => corAtual.value,
  invalidarCoresDasEtiquetas: invalidar,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function abrir(tag = "em andamento") {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CorDaEtiquetaKanban tag={tag} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: `Cor da etiqueta ${tag}`, exact: true }));
  return qc;
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
  corAtual.value = null;
});

describe("cor da etiqueta na configuração do Inbox", () => {
  it("prévia usa cor padrão; escolher só grava ao aplicar e atualiza o provider existente", async () => {
    const qc = abrir();
    expect(screen.getByText("em andamento", { exact: true })).toHaveStyle({
      backgroundColor: "#0099d5",
    });
    fireEvent.click(screen.getByRole("button", { name: "Roxo", exact: true }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText("em andamento", { exact: true })).toHaveStyle({
      backgroundColor: "#ab4aba",
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cor", exact: true }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/tags/vocabulario", {
        acao: "definir_cor",
        tag: "em andamento",
        cor: "#ab4aba",
      }),
    );
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith(qc));
  });

  it("abre na cor atual e retirar a personalização mantém a cor padrão da etapa", async () => {
    corAtual.value = "#ab4aba";
    abrir();
    expect(screen.getByRole("button", { name: "Roxo", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cor padrão", exact: true }));
    expect(screen.getByText("em andamento", { exact: true })).toHaveStyle({
      backgroundColor: "#0099d5",
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cor", exact: true }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api/v1/tags/vocabulario", {
        acao: "definir_cor",
        tag: "em andamento",
        cor: null,
      }),
    );
  });

  it("mantém a escolha aberta e informa falha sem anunciar que a cor mudou", async () => {
    const erro = new Error("Falha sintética");
    post.mockRejectedValue(erro);
    abrir("urgente");
    fireEvent.click(screen.getByRole("button", { name: "Azul", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cor", exact: true }));
    await waitFor(() =>
      expect(mostrarErro).toHaveBeenCalledWith(erro, undefined, undefined, expect.anything()),
    );
    expect(screen.getByRole("button", { name: "Aplicar cor", exact: true })).toBeVisible();
    expect(invalidar).not.toHaveBeenCalled();
  });

  it("mantém o seletor modal aberto enquanto aplica para não sobrepor a gravação da barra", async () => {
    let concluir!: (value: { data: object }) => void;
    const resposta = new Promise<{ data: object }>((resolve) => {
      concluir = resolve;
    });
    post.mockReturnValue(resposta);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar cor", exact: true }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salvando…", exact: true })).toBeDisabled(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: "Cor da etiqueta em andamento", exact: true }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Roxo", exact: true })).toBeDisabled();
    await act(async () => {
      concluir({ data: {} });
      await resposta;
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cor da etiqueta em andamento", exact: true }),
      ).not.toBeInTheDocument(),
    );
  });
});
