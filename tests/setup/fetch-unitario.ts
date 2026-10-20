/** Teste unitário usa dublê ou servidor local, nunca API externa faturável. */
export function protegerFetchUnitario(fetchLocal: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (entrada, init) => {
    const endereco = entrada instanceof Request ? entrada.url : String(entrada);
    if (URL.canParse(endereco)) {
      const host = new URL(endereco).hostname;
      if (host !== "localhost" && host !== "[::1]" && !/^127\.\d+\.\d+\.\d+$/.test(host)) {
        throw new TypeError("fetch failed", {
          cause: new Error(`Rede externa bloqueada no teste unitário (${host}); use dublê ou servidor local.`),
        });
      }
    }
    return fetchLocal(entrada, init);
  };
}
