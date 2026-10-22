/**
 * Adaptador isolado de acesso à API REST v2 do TCGdex.
 * Usado pela PoC (auditoria e índice local). Nenhuma tela deve chamar
 * fetch diretamente: tudo passa por aqui, para que o provedor possa ser
 * trocado sem reescrever o restante do app (ver especificação, 14.6).
 *
 * Trata explicitamente: timeout, 404, JSON inválido e resposta inesperada.
 * Nunca inventa dados quando a resposta falha.
 */

const DEFAULT_BASE_URL = "https://api.tcgdex.net/v2";
const DEFAULT_TIMEOUT_MS = 15000;

class TcgdexError extends Error {
  constructor(message, { kind, status = null, url = null, cause = null } = {}) {
    super(message);
    this.name = "TcgdexError";
    this.kind = kind; // "timeout" | "not_found" | "http_error" | "invalid_json" | "network"
    this.status = status;
    this.url = url;
    this.cause = cause;
  }
}

function createTcgdexClient({ baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  async function request(pathname) {
    const url = `${baseUrl}${pathname}`;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const kind = err.name === "TimeoutError" || err.code === "UND_ERR_CONNECT_TIMEOUT" ? "timeout" : "network";
      throw new TcgdexError(`Falha de ${kind === "timeout" ? "timeout" : "rede"} ao consultar ${url}`, {
        kind,
        url,
        cause: err,
      });
    }

    if (res.status === 404) {
      throw new TcgdexError(`Registro não encontrado: ${url}`, { kind: "not_found", status: 404, url });
    }
    if (!res.ok) {
      throw new TcgdexError(`TCGdex respondeu HTTP ${res.status} para ${url}`, { kind: "http_error", status: res.status, url });
    }

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new TcgdexError(`Resposta não é JSON válido: ${url}`, { kind: "invalid_json", url, cause: err });
    }
  }

  return {
    /** Busca a ficha completa de uma impressão de carta. */
    getCard(lang, cardId) {
      return request(`/${lang}/cards/${encodeURIComponent(cardId)}`);
    },
    /** Busca os metadados + lista de cartas de um set. */
    getSet(lang, setId) {
      return request(`/${lang}/sets/${encodeURIComponent(setId)}`);
    },
    /** Lista todos os sets disponíveis no idioma informado. */
    listSets(lang) {
      return request(`/${lang}/sets`);
    },
    /** Lista as séries disponíveis (agrupamento de sets, ex.: "sv", "tcgp"). */
    listSeries(lang) {
      return request(`/${lang}/series`);
    },
    /** Busca o detalhe de uma série, incluindo a lista de sets que ela agrupa. */
    getSeriesDetail(lang, serieId) {
      return request(`/${lang}/series/${encodeURIComponent(serieId)}`);
    },
  };
}

module.exports = { createTcgdexClient, TcgdexError };
