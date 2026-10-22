/**
 * Pontuação heurística de correspondência entre o texto extraído pelo OCR
 * e os registros do índice local de catálogo (ver especificação, 16.2).
 *
 * IMPORTANTE: este "matchingScore" é inteiramente da aplicação. NÃO é e
 * nunca deve ser chamado de "confiança do ML Kit" — o ML Kit só devolve
 * confiança de detecção de texto/elemento, não de identificação de carta.
 * Os pesos abaixo são parâmetros experimentais da PoC, a calibrar com o
 * dataset real de fotos (ver reports/decision.md, seção de limitações).
 *
 * Função pura e testável sem câmera/dispositivo: recebe o resultado de
 * parseCardText() e uma lista de registros do índice (catalogFixtures).
 */

const { normalizeForComparison } = require("./parseCardText");

const WEIGHTS = {
  name: 0.45,
  number: 0.4,
  set: 0.15,
};

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const prev = new Array(bl + 1);
  const curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

function nameSimilarity(a, b) {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.75;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

/** Compara número extraído com localId do catálogo, tolerando zero-padding. */
function numberMatches(extracted, localId) {
  if (!extracted || !localId) return { match: false, reason: "número ausente" };
  const e = extracted.replace(/^0+(?=\d)/, "").toUpperCase();
  const l = String(localId).replace(/^0+(?=\d)/, "").toUpperCase();
  if (e === l) return { match: true, reason: "número exato" };
  return { match: false, reason: "número não corresponde" };
}

/**
 * O número de coleção sozinho ("001") se repete em dezenas de sets
 * diferentes — achado real ao testar a busca manual com "001/165": sem
 * usar o total impresso na carta (165), o app retornava cartas de vários
 * sets não relacionados, todas numeradas "001". Quando o usuário informa
 * o total (ex.: "001/165"), ele deve bater com `setOfficial` ou
 * `setTotal` do registro; se não bater, o número provavelmente é só
 * coincidência entre sets diferentes — tratado como sinal NEGATIVO, não
 * neutro, para não empatar cartas de sets completamente distintos.
 */
function totalMatches(totalGuess, record) {
  if (!totalGuess) return { checked: false, match: null };
  const t = String(totalGuess).replace(/^0+(?=\d)/, "");
  const candidates = [record.setOfficial, record.setTotal].filter((v) => v != null).map(String);
  if (candidates.length === 0) return { checked: false, match: null };
  return { checked: true, match: candidates.includes(t) };
}

/**
 * @param {{nameGuess, numberGuess, setAbbreviationGuess}} parsed - saída de parseCardText()
 * @param {Array} indexRecords - registros normalizados (ver catalogFixtures.normalizeCard)
 * @param {{ topN?: number }} options
 * @returns {Array<{record, score, reasons: string[]}>}
 */
function rankCandidates(parsed, indexRecords, { topN = 5 } = {}) {
  // Achado real (ver parseCardText.js): o nome certo nem sempre é a 1ª
  // linha — testa a similaridade contra TODAS as linhas plausíveis e usa a
  // melhor, em vez de confiar só no nameGuess (a 1ª linha, só para exibição).
  const nameCandidates = parsed.nameLines && parsed.nameLines.length > 0 ? parsed.nameLines : [parsed.nameGuess];

  const scored = indexRecords.map((record) => {
    const reasons = [];
    let score = 0;

    const nameSim = Math.max(0, ...nameCandidates.map((line) => nameSimilarity(line, record.name)));
    score += nameSim * WEIGHTS.name;
    if (nameSim >= 0.99) reasons.push("nome exato");
    else if (nameSim >= 0.75) reasons.push("nome parcial");
    else if (nameSim > 0) reasons.push("nome fraco");
    else reasons.push("nome não reconhecido");

    const numRes = numberMatches(parsed.numberGuess, record.localId);
    if (numRes.match) {
      const totalRes = totalMatches(parsed.totalGuess, record);
      if (totalRes.checked && !totalRes.match) {
        // Número bate, mas o total do set não — quase certamente uma carta
        // de outro set com o mesmo número de coleção por coincidência.
        reasons.push("número bate, mas total do set não confere (outro set)");
      } else {
        score += WEIGHTS.number;
        reasons.push(totalRes.checked ? "número e total do set exatos" : numRes.reason);
      }
    } else {
      reasons.push(numRes.reason);
    }

    if (parsed.setAbbreviationGuess && record.setId) {
      const abbr = normalizeForComparison(parsed.setAbbreviationGuess);
      const setId = normalizeForComparison(record.setId);
      const setName = normalizeForComparison(record.setName || "");
      if (setId.includes(abbr) || abbr.includes(setId) || setName.includes(abbr)) {
        score += WEIGHTS.set;
        reasons.push("expansão compatível");
      } else {
        reasons.push("expansão não reconhecida");
      }
    } else {
      reasons.push("expansão sem sinal");
    }

    return { record, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, topN);

  // Sinaliza explicitamente quando a decisão deve exigir confirmação manual:
  // scores próximos entre os dois primeiros, ou número ausente/não reconhecido.
  const needsManualConfirmation =
    top.length === 0 ||
    top[0].score < 0.6 ||
    (top.length > 1 && top[0].score - top[1].score < 0.1) ||
    !parsed.numberGuess;

  return { candidates: top, needsManualConfirmation };
}

module.exports = { rankCandidates, nameSimilarity, numberMatches, totalMatches, levenshtein };
