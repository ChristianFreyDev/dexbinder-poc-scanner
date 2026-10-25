/**
 * Reordenação pura, pós-rankCandidates(): pedido real do usuário (25/10/2026,
 * testando em dispositivo físico) — quando duas impressões da MESMA carta
 * empatam em confiança (ex.: a mesma carta em inglês e português, caso já
 * documentado em reports/decision.md pra sv03.5-001), a versão em
 * português deve aparecer primeiro. NÃO mexe em rankCandidates.js (mantido
 * sem nenhuma alteração, já validado com cartas físicas reais) — só
 * reordena o resultado final, preservando a ordem por score já correta.
 */

const DEFAULT_PREFERRED_LANGUAGE = "pt";
const SCORE_EPSILON = 1e-9;

/**
 * @param {Array<{record, score, reasons}>} candidates saída de rankCandidates().candidates
 * @param {{ preferredLanguage?: string }} options
 * @returns {Array<{record, score, reasons}>} novo array reordenado (não muda o original)
 */
function preferLanguageOnTie(candidates, { preferredLanguage = DEFAULT_PREFERRED_LANGUAGE } = {}) {
  return [...candidates].sort((a, b) => {
    if (Math.abs(a.score - b.score) > SCORE_EPSILON) return b.score - a.score;
    const aPreferred = a.record.sourceLanguage === preferredLanguage;
    const bPreferred = b.record.sourceLanguage === preferredLanguage;
    if (aPreferred === bPreferred) return 0; // empate real entre não-preferidos: mantém ordem original (sort estável)
    return aPreferred ? -1 : 1;
  });
}

module.exports = { preferLanguageOnTie, DEFAULT_PREFERRED_LANGUAGE };
