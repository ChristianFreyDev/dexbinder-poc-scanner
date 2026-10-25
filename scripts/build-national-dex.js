/**
 * Gera o cadastro mestre das 1.025 espécies da Pokédex Nacional
 * (especificação da Entrega 1, seção 4.7) — INDEPENDENTE das cartas do
 * catálogo TCGdex, que não tem essa lista (ver limitação documentada em
 * src/catalog/catalogRepository.js).
 *
 * Fonte avaliada e escolhida: PokeAPI (https://pokeapi.co/api/v2/pokemon-species/).
 * - Confirmado via consulta real (25/10/2026): 1025 espécies, batendo
 *   exatamente com a meta "1.025 espécies" da especificação.
 * - API livre, sem autenticação, sem limite de taxa formal — só uma
 *   "Fair Use Policy" pedindo cache local e uso com moderação
 *   (https://pokeapi.co/docs/v2#fairuse), que este script respeita rodando
 *   UMA VEZ e gerando um arquivo versionado (não consultado de novo em
 *   runtime pelo app).
 * - Dados compilados pela comunidade a partir dos jogos oficiais Pokémon —
 *   mesma categoria de uso (fã, sem licença comercial formal da
 *   Nintendo/Game Freak/Creatures) já documentada para o TCGdex neste
 *   projeto (ver reports/decision.md, "Importante"). Avaliação de direitos
 *   pra uso comercial continua fora do escopo técnico — mesma ressalva.
 * - Números nacionais vêm de `pokedex_numbers[].pokedex.name === "national"`
 *   de cada espécie (fonte de verdade real, não assumido igual ao `id`).
 * - ACHADO REAL (25/10/2026, testado contra a API de verdade): a PokeAPI
 *   NÃO tem nomes de espécie em português — nem "pt" nem "pt-br" aparecem
 *   em `names[]` de NENHUMA espécie testada, apesar de "pt-br" existir
 *   como idioma registrado em `/api/v2/language` (usado só por outros
 *   tipos de recurso, não por `pokemon-species`). Limitação real da fonte,
 *   documentada aqui e no arquivo gerado — não contornada/inventada.
 *   Línguas realmente usadas pelo TCGdex neste projeto que SÃO cobertas:
 *   en, fr, de, ja. "es" entra de bônus (idioma TCGdex ainda não usado
 *   aqui, mas disponível e potencialmente útil numa entrega futura).
 *
 * Uso: node scripts/build-national-dex.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateNationalDex } = require("../src/data/nationalDexValidation");

const OUTPUT_PATH = path.join(__dirname, "..", "app", "assets", "data", "national-dex.json");
const BASE_URL = "https://pokeapi.co/api/v2/pokemon-species";
const TOTAL_SPECIES = 1025;
const CONCURRENCY = 8;
// Subconjunto de idiomas realmente úteis a este app — a resposta real traz
// mais (ko, zh-hans, zh-hant, ja-hrkt, ja-roma, es-419, cs); mantidos de
// fora por não serem usados em nenhuma outra parte do projeto. NÃO inclui
// português — a fonte simplesmente não tem (ver achado real acima).
const KEPT_LANGUAGES = ["en", "fr", "de", "es", "it", "ja"];

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ao buscar ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function extractNationalNumber(species) {
  const entry = (species.pokedex_numbers || []).find((p) => p.pokedex && p.pokedex.name === "national");
  return entry ? entry.entry_number : null;
}

function extractNames(species) {
  const names = {};
  for (const n of species.names || []) {
    const lang = n.language && n.language.name;
    if (lang && KEPT_LANGUAGES.includes(lang)) names[lang] = n.name;
  }
  return names;
}

async function fetchSpecies(id) {
  const raw = await fetchJson(`${BASE_URL}/${id}`);
  const nationalNumber = extractNationalNumber(raw);
  return {
    nationalNumber,
    slug: raw.name,
    names: extractNames(raw),
  };
}

async function main() {
  const results = new Array(TOTAL_SPECIES).fill(null);
  const failures = [];
  const ids = Array.from({ length: TOTAL_SPECIES }, (_, i) => i + 1);

  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const i = next++;
      const id = ids[i];
      try {
        results[i] = await fetchSpecies(id);
        if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${TOTAL_SPECIES} espécies buscadas...`);
      } catch (e) {
        failures.push({ id, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (failures.length > 0) {
    console.error(`\n${failures.length} espécies falharam ao buscar — NÃO gerando o arquivo final.`);
    console.error(failures.slice(0, 10));
    process.exit(1);
  }

  const species = results.filter(Boolean).sort((a, b) => (a.nationalNumber ?? 0) - (b.nationalNumber ?? 0));

  const checksum = crypto.createHash("sha256").update(JSON.stringify(species)).digest("hex");

  const output = {
    source: "https://pokeapi.co/api/v2/pokemon-species/",
    sourceDescription:
      "PokeAPI — projeto comunitário de dados Pokémon, sem vínculo oficial com Nintendo/Game Freak/Creatures " +
      "(mesma categoria de uso já documentada para o TCGdex neste projeto). Uso comercial requer avaliação de " +
      "direitos separada, fora do escopo técnico desta entrega.",
    knownLimitations: [
      "A fonte não tem nomes de espécie em português (nem 'pt' nem 'pt-br') — confirmado consultando a API " +
        "de verdade, não assumido. Precisa de uma fonte complementar numa entrega futura se nomes em " +
        "português forem necessários para espécies.",
      "Esta lista é só referência de espécies (1-1025) — NÃO é a associação carta->espécie do catálogo TCGdex, " +
        "que não existe de forma confiável no catálogo sincronizado (ver src/catalog/catalogRepository.js).",
    ],
    generatedAt: new Date().toISOString(),
    totalSpecies: species.length,
    languages: KEPT_LANGUAGES,
    checksum,
    species,
  };

  const { valid, errors } = validateNationalDex(output);
  if (!valid) {
    console.error("\nValidação falhou — NÃO salvando o arquivo:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n${species.length} espécies salvas em ${OUTPUT_PATH} (validação OK).`);
  console.log(`Checksum: ${checksum}`);
}

main().catch((e) => {
  console.error("Falha ao gerar a Pokédex Nacional:", e.message);
  process.exit(1);
});
