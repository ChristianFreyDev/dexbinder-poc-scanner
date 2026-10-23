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
 * @param {{nameGuess, numberGuess, normalizedText}} parsed - saída de parseCardText()
 * @param {Array} indexRecords - registros normalizados (ver catalogFixtures.normalizeCard)
 * @param {{ topN?: number }} options
 * @returns {Array<{record, score, reasons: string[]}>}
 */
function rankCandidates(parsed, indexRecords, { topN = 5 } = {}) {
  // Achado real (ver parseCardText.js): o nome certo nem sempre é a 1ª
  // linha — testa a similaridade contra TODAS as linhas plausíveis e usa a
  // melhor, em vez de confiar só no nameGuess (a 1ª linha, só para exibição).
  const nameCandidates = parsed.nameLines && parsed.nameLines.length > 0 ? parsed.nameLines : [parsed.nameGuess];

  // Idem para número: usa parsed.numberCandidates (todas as leituras) quando
  // disponível; cai para o par único numberGuess/totalGuess por
  // compatibilidade com chamadores antigos/sintéticos.
  const numberCandidates =
    parsed.numberCandidates && parsed.numberCandidates.length > 0
      ? parsed.numberCandidates
      : parsed.numberGuess
        ? [{ number: parsed.numberGuess, total: parsed.totalGuess }]
        : [];

  const scored = indexRecords.map((record) => {
    const reasons = [];
    let score = 0;

    const nameSim = Math.max(0, ...nameCandidates.map((line) => nameSimilarity(line, record.name)));
    score += nameSim * WEIGHTS.name;
    if (nameSim >= 0.99) reasons.push("nome exato");
    else if (nameSim >= 0.75) reasons.push("nome parcial");
    else if (nameSim > 0) reasons.push("nome fraco");
    else reasons.push("nome não reconhecido");

    // Achado real (ver parseCardText.js): o OCR às vezes lê o MESMO número
    // de duas formas diferentes em linhas distintas de um mesmo recorte
    // (uma certa, outra com um dígito confundido) — testa TODAS as leituras
    // candidatas e usa a que der o melhor resultado para este registro, em
    // vez de travar na primeira encontrada.
    let bestNumberCredit = 0;
    let bestNumberReason = "número ausente";
    for (const candidate of numberCandidates) {
      const numRes = numberMatches(candidate.number, record.localId);
      if (!numRes.match) {
        if (bestNumberCredit === 0 && bestNumberReason === "número ausente") bestNumberReason = numRes.reason;
        continue;
      }
      const totalRes = totalMatches(candidate.total, record);
      if (totalRes.checked && !totalRes.match) {
        // Número bate, mas o total do set não — quase certamente uma carta
        // de outro set com o mesmo número de coleção por coincidência.
        if (bestNumberCredit === 0) bestNumberReason = "número bate, mas total do set não confere (outro set)";
        continue;
      }
      const credit = WEIGHTS.number;
      if (credit > bestNumberCredit) {
        bestNumberCredit = credit;
        bestNumberReason = totalRes.checked ? "número e total do set exatos" : numRes.reason;
      }
    }
    score += bestNumberCredit;
    reasons.push(bestNumberReason);

    // Achado real (3 fotos de cartas físicas distintas, 22/10/2026): o
    // código de expansão impresso ("MEW" para o set "151") vem colado no
    // MESMO texto ruidoso do número ("G MEWPI 025/165"), nunca sozinho
    // numa linha própria — por isso a busca é por substring no texto bruto
    // inteiro (via setPrintedCode, ver catalogFixtures.js), não por uma
    // linha isolada extraída à parte.
    if (record.setPrintedCode) {
      const code = normalizeForComparison(record.setPrintedCode);
      if (parsed.normalizedText && parsed.normalizedText.includes(code)) {
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
