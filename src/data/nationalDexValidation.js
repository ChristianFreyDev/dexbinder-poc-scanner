/**
 * Validação pura do arquivo gerado por scripts/build-national-dex.js
 * (especificação da Entrega 1, seção 4.7, item 6: "validar IDs duplicados,
 * ausentes, nomes vazios e lacunas no intervalo esperado").
 */

const crypto = require("crypto");

/**
 * @param {object} data conteúdo de app/assets/data/national-dex.json já parseado
 * @param {{ expectedTotal?: number }} options
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateNationalDex(data, { expectedTotal = 1025 } = {}) {
  const errors = [];

  if (!data || !Array.isArray(data.species)) {
    return { valid: false, errors: ["campo 'species' ausente ou não é um array"] };
  }

  if (data.totalSpecies !== expectedTotal) {
    errors.push(`totalSpecies declarado (${data.totalSpecies}) difere do esperado (${expectedTotal})`);
  }
  if (data.species.length !== expectedTotal) {
    errors.push(`species.length (${data.species.length}) difere do esperado (${expectedTotal})`);
  }

  const numbers = data.species.map((s) => s.nationalNumber);
  const uniqueNumbers = new Set(numbers);
  if (uniqueNumbers.size !== numbers.length) {
    errors.push(`números nacionais duplicados: ${numbers.length - uniqueNumbers.size} repetição(ões)`);
  }

  const missing = [];
  for (let i = 1; i <= expectedTotal; i++) {
    if (!uniqueNumbers.has(i)) missing.push(i);
  }
  if (missing.length > 0) {
    errors.push(`números nacionais ausentes (lacuna no intervalo 1-${expectedTotal}): ${missing.join(", ")}`);
  }

  const emptySlug = data.species.filter((s) => !s.slug);
  if (emptySlug.length > 0) {
    errors.push(`${emptySlug.length} espécie(s) sem slug`);
  }

  const emptyEnglishName = data.species.filter((s) => !s.names || !s.names.en);
  if (emptyEnglishName.length > 0) {
    errors.push(`${emptyEnglishName.length} espécie(s) sem nome em inglês`);
  }

  if (data.checksum) {
    const recomputed = crypto.createHash("sha256").update(JSON.stringify(data.species)).digest("hex");
    if (recomputed !== data.checksum) {
      errors.push("checksum declarado não bate com o recalculado sobre 'species' — arquivo pode ter sido editado à mão");
    }
  } else {
    errors.push("campo 'checksum' ausente");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateNationalDex };
