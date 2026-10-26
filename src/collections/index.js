/**
 * Instâncias únicas dos repositórios pessoais, para a UI sempre falar com o
 * MESMO banco pessoal aberto (igual ao padrão de
 * src/catalog/catalogRepository.js, que exporta `catalogRepository` já
 * instanciado). Sem `db` no construtor, cada repositório abre a conexão real
 * via src/storage/userDb.js (cacheada, migrações já aplicadas) na primeira
 * chamada.
 */
const { CollectionRepository } = require("./collectionRepository");
const { ChecklistRepository } = require("./checklistRepository");
const { PhysicalCopyRepository } = require("./physicalCopyRepository");
const { CardSpeciesRepository } = require("./cardSpeciesRepository");
const { CollectionProgressService } = require("./collectionProgressService");

const collectionRepository = new CollectionRepository();
const checklistRepository = new ChecklistRepository();
const physicalCopyRepository = new PhysicalCopyRepository();
const cardSpeciesRepository = new CardSpeciesRepository();
const collectionProgressService = new CollectionProgressService();

module.exports = {
  collectionRepository,
  checklistRepository,
  physicalCopyRepository,
  cardSpeciesRepository,
  collectionProgressService,
  CollectionRepository,
  ChecklistRepository,
  PhysicalCopyRepository,
  CardSpeciesRepository,
  CollectionProgressService,
};
