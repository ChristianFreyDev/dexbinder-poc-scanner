/**
 * Parser dedicado pra busca manual (texto digitado pelo usuário), separado
 * de parseCardText.js (texto do OCR). Achado real (25/10/2026, dispositivo
 * físico): buscar manualmente só "001" não achava nada — parseCardText()
 * exige que um número solto venha com prefixo de letra (ex.: "DP01") pra
 * NÃO confundir com ruído de OCR (achado real documentado lá: um dígito
 * isolado como "2" aparece em qualquer carta por coincidência). Essa regra
 * faz sentido pro OCR de uma foto, mas quebra a busca manual: quando a
 * PESSOA digita "001" de propósito, é um número de coleção de verdade, não
 * ruído — não deve ser descartado.
 *
 * parseCardText.js continua INTOCADO (nenhuma alteração, 36 testes
 * preservados) — este é um parser separado, só pra texto digitado.
 */

const { normalizeForComparison } = require("./parseCardText");

const SLASH_NUMBER = /^(\d{1,4})\/(\d{1,4})$/;
const PLAIN_NUMBER = /^\d{1,4}$/;
const LETTER_PREFIXED_NUMBER = /^[A-Za-z]{1,5}\d{1,4}$/;

/**
 * @param {string} query texto digitado pelo usuário na busca manual
 * @returns {{
 *   rawText: string, normalizedText: string,
 *   nameGuess: string|null, nameLines: string[],
 *   numberGuess: string|null, totalGuess: string|null,
 *   numberCandidates: Array<{ number: string, total: string|null }>,
 * }} mesmo formato de saída de parseCardText(), pra alimentar
 *     rankCandidates()/CatalogRepository sem nenhuma mudança lá.
 */
function parseManualQuery(query) {
  const rawText = (query || "").trim();
  const tokens = rawText.split(/\s+/).filter(Boolean);

  const numberCandidates = [];
  const nameWords = [];

  for (const token of tokens) {
    const slashMatch = token.match(SLASH_NUMBER);
    if (slashMatch) {
      numberCandidates.push({ number: slashMatch[1], total: slashMatch[2] });
      continue;
    }
    if (PLAIN_NUMBER.test(token)) {
      numberCandidates.push({ number: token, total: null });
      continue;
    }
    // localId atípico digitado direto (ex.: "GG01", "DP01" — ver
    // reports/catalog-audit.md, achado 4).
    if (LETTER_PREFIXED_NUMBER.test(token)) {
      numberCandidates.push({ number: token.toUpperCase(), total: null });
      continue;
    }
    nameWords.push(token);
  }

  const nameGuess = nameWords.length > 0 ? nameWords.join(" ") : null;
  const nameLines = nameGuess ? [nameGuess] : [];
  const numberGuess = numberCandidates.length > 0 ? numberCandidates[0].number : null;
  const totalGuess = numberCandidates.length > 0 ? numberCandidates[0].total : null;

  return {
    rawText,
    normalizedText: normalizeForComparison(rawText),
    nameGuess,
    nameLines,
    numberGuess,
    totalGuess,
    numberCandidates,
  };
}

module.exports = { parseManualQuery };
