/**
 * Extração pura dos termos de busca (número/nome) usados pra pré-filtrar o
 * catálogo via SQL ANTES de rodar rankCandidates() — achado real em
 * dispositivo físico (25/10/2026): rankCandidates() rodando sobre as 21.828
 * cartas inteiras do catálogo completo levava 14-20 SEGUNDOS no celular
 * (Hermes), contra 76ms no desktop (V8) — Levenshtein em JS escala mal em
 * Hermes nesse volume. A busca SQL (nativa, C) por número/nome reduz pra um
 * punhado de candidatos antes da pontuação em JS, sem mudar NADA na lógica
 * de rankCandidates.js (já validada com cartas físicas reais).
 */

/**
 * @param {{nameGuess, nameLines, numberCandidates}} parsed - saída de parseCardText()
 * @param {{ maxNameLines?: number }} options
 * @returns {{ numbers: string[], names: string[] }}
 */
function extractCandidateSearchTerms(parsed, { maxNameLines = 3 } = {}) {
  const numbers = [...new Set((parsed.numberCandidates || []).map((c) => c.number).filter(Boolean))];

  const allNames = parsed.nameLines && parsed.nameLines.length > 0 ? parsed.nameLines : [parsed.nameGuess].filter(Boolean);
  // Só linhas com conteúdo substancial (evita termos curtos demais que
  // bateriam com praticamente qualquer carta numa busca LIKE); as mais
  // compridas primeiro (mais chance de serem o nome de verdade, não ruído).
  const names = [...new Set(allNames)]
    .filter((n) => n && n.trim().length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, maxNameLines);

  return { numbers, names };
}

module.exports = { extractCandidateSearchTerms };
