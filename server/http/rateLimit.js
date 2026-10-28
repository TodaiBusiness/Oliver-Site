/* =========================================================================
   Limite de tentativas em memória (janela deslizante por chave).

   Em memória de propósito: não há tabela para isso e o serviço roda numa
   instância. Reiniciar zera a contagem, e com várias instâncias cada uma teria
   a sua — aceitável para conter spam de formulário e força bruta barata,
   insuficiente para ataque distribuído (problema da camada de rede).

   ATENÇÃO: o estado é POR PROCESSO/INSTÂNCIA (um Map na memória). Em funções
   serverless (Netlify) cada instância fria tem o seu e o limite efetivo é
   multiplicado pelo número de instâncias; não é compartilhado nem persistido.

   O mapa tem teto (`maxKeys`): sem ele, quem forja chaves novas a cada pedido
   (documentos diferentes, por exemplo) faria a memória crescer sem limite.
   ========================================================================= */

export function createRateLimiter({ max, windowMs, maxKeys = 10_000 }) {
  /** chave -> instantes dos pedidos aceitos dentro da janela. */
  const recent = new Map();

  function sweep(now) {
    const cutoff = now - windowMs;
    for (const [key, timestamps] of recent) {
      const fresh = timestamps.filter((instant) => instant > cutoff);
      if (fresh.length === 0) recent.delete(key);
      else recent.set(key, fresh);
    }
  }

  /** Registra uma tentativa. Devolve false quando a chave estourou o limite. */
  function hit(key) {
    const now = Date.now();
    sweep(now);

    const timestamps = recent.get(key) ?? [];
    if (timestamps.length >= max) return false;

    /* Teto atingido com chave nova: descarta a mais antiga (a primeira
       inserida no Map). Quem está perto do limite é reinserido a cada hit. */
    if (!recent.has(key)) {
      while (recent.size >= maxKeys) {
        recent.delete(recent.keys().next().value);
      }
    }
    recent.delete(key);
    recent.set(key, [...timestamps, now]);
    return true;
  }

  return { hit, size: () => recent.size };
}

/**
 * Contador de janela fixa (barato: um número por chave, em vez de uma lista de
 * instantes). Serve para tetos longos, como "por dia", onde guardar cada pedido
 * pesaria. Mesmo aviso do limitador acima: estado por processo, em memória, e
 * com teto de chaves (a mais antiga sai primeiro).
 */
export function createWindowCounter({ max, windowMs, maxKeys = 10_000, now = () => Date.now() }) {
  /** chave -> { start, count } */
  const counters = new Map();

  function hit(key) {
    const t = now();
    const current = counters.get(key);
    if (current && t - current.start < windowMs) {
      if (current.count >= max) return false;
      current.count += 1;
      return true;
    }
    if (!current) {
      while (counters.size >= maxKeys) counters.delete(counters.keys().next().value);
    }
    counters.delete(key);
    counters.set(key, { start: t, count: 1 });
    return true;
  }

  return { hit, size: () => counters.size };
}
