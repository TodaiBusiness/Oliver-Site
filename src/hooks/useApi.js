import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carrega dados da API cuidando dos três estados que sempre existem:
 * carregando, erro e resultado. Evita repetir o mesmo try/catch em cada tela.
 *
 * `deps` controla o recarregamento; `reload()` força de novo.
 */
export function useApi(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    /* Numa recarga, mantém o conteúdo anterior na tela: trocar tudo por
       "carregando" faria a lista piscar a cada atualização. */
    setLoading((atual) => atual || data === null);
    setError(null);

    loader()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((problem) => {
        if (!cancelled) setError(problem);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `data` de propósito fora das dependências: entra só como valor inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}

/**
 * Lista paginada com "carregar mais". A API não devolve total: se a página
 * veio cheia, assume que ainda há mais.
 *
 * `fetchPage(page, limit)` devolve a lista daquela página. Mudou `deps`
 * (busca, filtro)? Recomeça da primeira página. `reload()` refaz as páginas
 * já carregadas, para uma edição não jogar a pessoa de volta ao topo.
 */
export function usePaged(fetchPage, deps = [], pageSize = 20) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [moreError, setMoreError] = useState(null);
  const [tick, setTick] = useState(0);
  const pageRef = useRef(1);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  /* Muda filtro/busca: volta ao começo. Recarga: refaz até a página atual. */
  const resetKey = JSON.stringify(deps);
  const lastReset = useRef(resetKey);

  useEffect(() => {
    let cancelled = false;
    const filtroMudou = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    if (filtroMudou) pageRef.current = 1;

    setError(null);
    setMoreError(null);
    setLoading((atual) => atual || filtroMudou);

    (async () => {
      try {
        /* Refaz todas as páginas já vistas, na mesma ordem. */
        const ate = pageRef.current;
        const paginas = await Promise.all(
          Array.from({ length: ate }, (_, i) => fetchRef.current(i + 1, pageSize))
        );
        if (cancelled) return;
        const tudo = paginas.flat();
        setItems(tudo);
        setHasMore(paginas[paginas.length - 1].length >= pageSize);
        setPage(ate);
      } catch (problema) {
        if (!cancelled) setError(problema);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, tick, pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const proxima = pageRef.current + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const novos = await fetchRef.current(proxima, pageSize);
      pageRef.current = proxima;
      setPage(proxima);
      setItems((atuais) => {
        const vistos = new Set(atuais.map((item) => item.id));
        return [...atuais, ...novos.filter((item) => !vistos.has(item.id))];
      });
      setHasMore(novos.length >= pageSize);
    } catch (problema) {
      setMoreError(problema);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, pageSize]);

  const reload = useCallback(() => setTick((valor) => valor + 1), []);

  return { items, setItems, loading, error, hasMore, loadingMore, moreError, loadMore, reload, page };
}
