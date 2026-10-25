/**
 * CatalogRepository — camada única entre a interface/scanner e os detalhes
 * de armazenamento do catálogo (especificação da Entrega 1, seção 4.4): a
 * UI nunca abre o banco SQLite diretamente nem fala com catalogSync.js/
 * catalogIndex.js por conta própria.
 *
 * Compõe módulos já existentes, sem duplicar lógica:
 * - src/storage/catalogSync.js — download/validação/instalação do banco.
 * - src/storage/catalogIndex.js — consultas SQL sobre o banco instalado.
 * - src/storage/physicalClassification.js — física vs. digital vs. não
 *   confirmada (especificação, seção 4.6).
 * - src/scanner/rankCandidates.js — ranking do scanner, SEM NENHUMA
 *   alteração (já testado com cartas físicas reais na Entrega 0).
 * - src/scanner/resolveImageUrl.js — resolução de URL de imagem.
 *
 * Decisão de performance (conservadora, documentada — especificação, seção
 * 9: "quando houver uma decisão pendente que não bloqueie a implementação,
 * adote a opção mais conservadora"): os registros físicos confirmados são
 * carregados inteiros em memória UMA VEZ (cache invalidado só quando o
 * catálogo é atualizado) e `rankCandidates()` roda sobre esse array em JS,
 * exatamente como a Entrega 0 já fazia — só que agora com o catálogo
 * completo (milhares de linhas) em vez do bundle de 58 cartas. Não
 * otimizado com pré-filtro SQL por número/nome antes do ranking; não há
 * medição real de desempenho em dispositivo físico com o catálogo grande
 * ainda — ver reports/delivery-1.md para o resultado real medido e esta
 * decisão reavaliada se necessário.
 *
 * Associação carta -> espécie (seção 4.4, "pesquisar por Pokémon
 * associado"): LIMITAÇÃO CONHECIDA E DOCUMENTADA, não escondida. O banco
 * sincronizado (scripts/sync-full-catalog.js) usa a forma resumida de
 * `GET /{lang}/sets/{id}` (id/image/localId/name), que NÃO inclui `dexId`
 * — só a forma completa por carta (`GET /{lang}/cards/{id}`) traz isso, e
 * buscar isso pra TODAS as cartas reintroduziria uma chamada HTTP por
 * carta (o problema que a sincronização por set resolveu). Por isso
 * `searchByPokemon()` abaixo é um best-effort por NOME (não por `dexId`
 * confirmado) e todo resultado vem marcado com `speciesAssociationConfirmed:
 * false` — nunca apresentado silenciosamente como uma associação real.
 */

// require() de catalogSync é LAZY (só dentro dos métodos que precisam) pelo
// mesmo motivo de catalogIndex.js: expo-file-system/expo-sqlite não rodam
// em Node puro. O resto desta classe (filtros, classificação, consultas via
// catalogIndex, wiring do rankCandidates) fica testável de verdade em Node
// com um `db` de teste — ver scripts/run-catalog-repository-tests.js.
function getCatalogSync() {
  return require("../storage/catalogSync");
}
const catalogIndex = require("../storage/catalogIndex");
const { classifyPhysical, isConfirmedPhysical, PHYSICAL, DIGITAL, UNCONFIRMED } = require("../storage/physicalClassification");
const { rankCandidates } = require("../scanner/rankCandidates");
const { resolveImageUrl } = require("../scanner/resolveImageUrl");

// Mesma lista usada por scripts/sync-full-catalog.js (DIGITAL_ONLY_SERIES) e
// src/catalog/catalogFixtures.js (filterPhysicalCards) — duplicada
// deliberadamente (um array de 1 string, não vale um módulo compartilhado
// entre Node/scripts e o app React Native só por isso).
const DIGITAL_ONLY_SERIES = ["tcgp"];

class CatalogRepository {
  constructor() {
    this._db = null;
    this._physicalRecordsCache = null;
  }

  /** Garante que o catálogo está baixado/atualizado (ver catalogSync.ensureCatalogReady). */
  async ensureReady({ onStatusChange } = {}) {
    const result = await getCatalogSync().ensureCatalogReady({ onStatusChange });
    if (result.updated) {
      // Catálogo mudou de verdade (checksum diferente) — invalida o cache
      // em memória e a conexão aberta com o banco antigo.
      this._physicalRecordsCache = null;
      if (this._db) {
        try {
          await this._db.closeAsync();
        } catch {
          // já fechado — nada a fazer
        }
        this._db = null;
      }
    }
    return result;
  }

  /** Checagem rápida, sem rede, se já existe um catálogo instalado (ver UI de status). */
  getInstalledInfo() {
    return getCatalogSync().getInstalledCatalogInfo();
  }

  async _getDb() {
    if (!this._db) this._db = await catalogIndex.openSyncedCatalogDb();
    return this._db;
  }

  /** Classifica e filtra para só as impressões física CONFIRMADAS (especificação, seção 4.6). */
  _filterPhysical(records) {
    return records.filter((r) => isConfirmedPhysical(r.setSerieId, DIGITAL_ONLY_SERIES));
  }

  /**
   * Todos os registros físicos confirmados, em cache em memória — base para
   * o ranking do scanner e a busca manual (ver nota de performance acima).
   */
  async getAllPhysicalRecords({ forceReload = false } = {}) {
    if (this._physicalRecordsCache && !forceReload) return this._physicalRecordsCache;
    const db = await this._getDb();
    const all = await catalogIndex.getAllRecords(db);
    this._physicalRecordsCache = this._filterPhysical(all);
    return this._physicalRecordsCache;
  }

  /** Quantas impressões têm série desconhecida (não confirmadas física nem digital) — transparência, nunca escondido. */
  async getUnconfirmedCount() {
    const db = await this._getDb();
    const all = await catalogIndex.getAllRecords(db);
    return all.filter((r) => classifyPhysical(r.setSerieId, DIGITAL_ONLY_SERIES) === UNCONFIRMED).length;
  }

  async searchByName(query, opts = {}) {
    const db = await this._getDb();
    const results = await catalogIndex.searchByName(db, query, opts);
    return this._filterPhysical(results);
  }

  async searchByNumber(number, opts = {}) {
    const db = await this._getDb();
    const results = await catalogIndex.searchByNumber(db, number, opts);
    return this._filterPhysical(results);
  }

  async searchBySet(query, opts = {}) {
    const db = await this._getDb();
    const results = await catalogIndex.searchBySet(db, query, opts);
    return this._filterPhysical(results);
  }

  /**
   * Best-effort por nome do Pokémon — NÃO é uma associação carta->espécie
   * confirmada (ver limitação documentada no cabeçalho deste arquivo).
   * Cada resultado vem marcado com `speciesAssociationConfirmed: false`.
   */
  async searchByPokemon(speciesName, opts = {}) {
    const results = await this.searchByName(speciesName, opts);
    return results.map((r) => ({ ...r, speciesAssociationConfirmed: false }));
  }

  async getCardDetail(sourceCardId, sourceLanguage) {
    const db = await this._getDb();
    const record = await catalogIndex.getCardDetail(db, sourceCardId, sourceLanguage);
    if (!record) return null;
    return { ...record, physicalClassification: classifyPhysical(record.setSerieId, DIGITAL_ONLY_SERIES) };
  }

  async listSets() {
    const db = await this._getDb();
    return catalogIndex.listSets(db);
  }

  async listLanguages() {
    const db = await this._getDb();
    return catalogIndex.listLanguages(db);
  }

  resolveImage(record, quality = "low") {
    return resolveImageUrl(record, quality);
  }

  /**
   * Candidatos do scanner — usa o MESMO rankCandidates() já validado com
   * cartas físicas reais na Entrega 0, sem alterações, agora sobre o
   * catálogo completo instalado em vez do bundle de 58 cartas de teste.
   */
  async getScannerCandidates(parsed, { topN = 5 } = {}) {
    const records = await this.getAllPhysicalRecords();
    return rankCandidates(parsed, records, { topN });
  }
}

const catalogRepository = new CatalogRepository();

module.exports = { CatalogRepository, catalogRepository, PHYSICAL, DIGITAL, UNCONFIRMED };
