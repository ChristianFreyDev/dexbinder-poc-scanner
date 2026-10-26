/**
 * Testes reais (node:test) de src/collections/cardSpeciesRepository.js —
 * especificação da Entrega 2, seções 3.4, 12.5.
 * Executar: node --test scripts/run-card-species-repository-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMigratedTestDb } = require("./testHelpers/userTestDb");
const { CardSpeciesRepository } = require("../src/collections/cardSpeciesRepository");

async function setup() {
  const db = await createMigratedTestDb();
  return new CardSpeciesRepository(db);
}

test("confirmAssociation: cria o vínculo como confirmed", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-1", nationalDexNumber: 1 });
  const links = await repo.getAssociations("key-1");
  assert.equal(links.length, 1);
  assert.equal(links[0].associationStatus, "confirmed");
});

test("confirmAssociation: confirmar a mesma carta/espécie de novo não duplica a linha (upsert)", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-1", nationalDexNumber: 1 });
  await repo.confirmAssociation({ catalogCardKey: "key-1", nationalDexNumber: 1, source: "catalog_verified" });
  const links = await repo.getAssociations("key-1");
  assert.equal(links.length, 1);
  assert.equal(links[0].associationSource, "catalog_verified");
});

test("carta que representa VÁRIAS espécies: cada par catalogCardKey/espécie é independente", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-multi", nationalDexNumber: 1 });
  await repo.confirmAssociation({ catalogCardKey: "key-multi", nationalDexNumber: 2 });
  const links = await repo.getAssociations("key-multi");
  assert.equal(links.length, 2);
});

test("removeAssociation: remove só o par específico, sem afetar outras espécies da mesma carta", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-multi", nationalDexNumber: 1 });
  await repo.confirmAssociation({ catalogCardKey: "key-multi", nationalDexNumber: 2 });
  await repo.removeAssociation({ catalogCardKey: "key-multi", nationalDexNumber: 1 });
  const links = await repo.getAssociations("key-multi");
  assert.equal(links.length, 1);
  assert.equal(links[0].nationalDexNumber, 2);
});

test("getConfirmedLinksMap: só traz vínculos confirmed, nunca suggested", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-1", nationalDexNumber: 1 });
  const db = await createMigratedTestDb(); // banco separado só pra inserir um "suggested" manualmente
  const now = new Date().toISOString();
  const repo2 = new CardSpeciesRepository(db);
  await db.runAsync(
    `INSERT INTO card_species_links (catalog_card_key, national_dex_number, association_status, association_source, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    ["key-2", 2, "suggested", "name_guess", now, now]
  );
  const map = await repo2.getConfirmedLinksMap();
  assert.equal(map.has("key-2"), false, "suggested não deveria aparecer no mapa de confirmados");

  const mapWithConfirmed = await repo.getConfirmedLinksMap();
  assert.ok(mapWithConfirmed.get("key-1").has(1));
});

test("getCardKeysForSpecies: devolve as catalogCardKeys confirmadas de uma espécie", async () => {
  const repo = await setup();
  await repo.confirmAssociation({ catalogCardKey: "key-a", nationalDexNumber: 25 });
  await repo.confirmAssociation({ catalogCardKey: "key-b", nationalDexNumber: 25 });
  const keys = await repo.getCardKeysForSpecies(25);
  assert.deepEqual(keys.sort(), ["key-a", "key-b"]);
});

test("suggestAssociations nunca confirma sozinho — é só uma dica (delegação ao domínio puro)", async () => {
  const repo = await setup();
  const dex = [{ nationalNumber: 25, slug: "pikachu", names: { en: "Pikachu" } }];
  const suggestions = repo.suggestAssociations("Pikachu V", dex);
  assert.equal(suggestions.length, 1);
  const links = await repo.getAssociations("qualquer-key");
  assert.equal(links.length, 0, "nada foi persistido só por sugerir");
});
