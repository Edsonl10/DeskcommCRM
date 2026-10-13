import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";
import { useConversationNotes } from "@/hooks/inbox/useConversationNotes";
import { usePassagensDaConversa } from "@/hooks/inbox/usePassagensDaConversa";
import { ApiError } from "@/lib/api/types";

const { get, showApiError } = vi.hoisted(() => ({ get: vi.fn(), showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));
vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: () => ({ status: "SUBSCRIBED", ultimaEntrega: { current: null } }),
}));
vi.mock("@/hooks/realtime/useRefetchDeSeguranca", () => ({ useRefetchDeSeguranca: () => ({}) }));

beforeEach(() => {
  get.mockReset();
  showApiError.mockClear();
});

describe.each([
  ["mensagens", useMessagesRealtime],
  ["notas", useConversationNotes],
  ["passagens", usePassagensDaConversa],
] as const)("cancelamento de %s", (_name, useLeitura) => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } });
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  it("não multiplica as tentativas de uma leitura que o cliente HTTP já retentou", async () => {
    get.mockRejectedValue(new ApiError(503, "service_unavailable", undefined, "request-test"));
    renderHook(() => useLeitura("c-1"), { wrapper });
    await waitFor(() => expect(qc.getQueryCache().getAll()[0]?.state.status).toBe("error"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(showApiError).toHaveBeenCalledTimes(1);
  });

  it("trocar de conversa cancela a requisição antiga sem aviso de falha", async () => {
    get.mockImplementation((_path: string, opts?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const view = renderHook(({ id }) => useLeitura(id), { wrapper, initialProps: { id: "c-1" } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const signal = get.mock.calls[0]![1]?.signal as AbortSignal | undefined;
    expect(signal).toBeDefined();
    view.rerender({ id: "c-2" });
    await waitFor(() => expect(signal!.aborted).toBe(true));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(showApiError).not.toHaveBeenCalled();
  });

  it("continua mostrando um erro real da conversa aberta", async () => {
    const erro = new Error("Falha do servidor");
    get.mockRejectedValue(erro);
    renderHook(() => useLeitura("c-1"), { wrapper });
    await waitFor(() => expect(showApiError).toHaveBeenCalledWith(erro));
  });
});
