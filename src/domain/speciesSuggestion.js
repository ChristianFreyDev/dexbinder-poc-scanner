/**
 * Sugestão (NUNCA confirmação automática) de espécie a partir do nome de uma
 * carta — especificação da Entrega 2, seção 3.4: "quando faltar associação,
 * permitir que o usuário selecione manualmente a espécie... o nome em
 * português ainda não está disponível, não inventar tradução". Usado só para
 * ordenar/pré-filtrar o seletor manual de espécie; o resultado nunca é
 * gravado como `confirmed` sozinho (isso exige CardSpeciesRepository.
 * confirmAssociation(), chamado só por ação explícita do usuário).
 *
 * Não associa Treinador/Energia por inferência de texto (especificação,
 * seção 3.4) — mas esta função não sabe se uma carta é Treinador/Energia
 * (o catálogo compacto não guarda `category`, achado real da Entrega 1); por
 * isso quem decide chamar ou não esta função pela carta certa é a UI/
 * repositório (ex.: não oferecer "associar espécie" fora do fluxo de
 * fichário Pokédex).
 */

function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string} cardName nome da impressão (ex.: "Mega Charizard X")
 * @param {Array<{nationalNumber, slug, names}>} nationalDexSpecies catálogo mestre (app/assets/data/national-dex.json .species)
 * @param {{ limit?: number }} options
 * @returns {Array<{nationalNumber, label, matchType: "exact"|"startsWith"|"contains"}>}
 */
function suggestSpeciesForCardName(cardName, nationalDexSpecies, { limit = 10 } = {}) {
  const normalized = normalize(cardName);
  if (!normalized) return [];

  const scored = [];
  for (const species of nationalDexSpecies) {
    const names = Object.values(species.names || {}).filter(Boolean).map(normalize);
    if (names.length === 0) continue;

    let matchType = null;
    if (names.some((n) => n === normalized)) matchType = "exact";
    else if (names.some((n) => normalized.startsWith(n) || n.startsWith(normalized))) matchType = "startsWith";
    else if (names.some((n) => normalized.includes(n))) matchType = "contains";

    if (matchType) {
      const label = species.names.en || species.slug;
      scored.push({ nationalNumber: species.nationalNumber, label, matchType });
    }
  }

  const rank = { exact: 0, startsWith: 1, contains: 2 };
  scored.sort((a, b) => rank[a.matchType] - rank[b.matchType] || a.nationalNumber - b.nationalNumber);
  return scored.slice(0, limit);
}

module.exports = { suggestSpeciesForCardName };
