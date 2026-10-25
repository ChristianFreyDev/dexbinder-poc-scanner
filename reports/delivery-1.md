# DexBinder — Entrega 1: Relatório de entrega

**Data:** 25/10/2026
**Branch/commit inicial (baseline):** `master` @ `aa0e5587bc44a3d64825e5bba442074f901629ac`
**Commits desta entrega:** `955d2db` → `56f01b8` (6 commits, ver seção 9)

---

## 1. Baseline (antes de alterar qualquer código)

- **Branch:** `master`. **Commit inicial:** `aa0e558` ("Registra 2ª rodada de testes reais em casa (20 cartas do set 151)"). Working tree limpo.
- **`npm test` antes de qualquer mudança:** 44/44 testes (`node:test`) + `check:jsx` OK.
  ```
  test:matching          # tests 36, pass 36, fail 0
  test:catalog-sync      # tests 4,  pass 4,  fail 0
  test:cron-switch       # tests 4,  pass 4,  fail 0
  check:jsx               OK: App.js / app/index.jsx
  ```
- **`npx expo-doctor`:** 17/20 checks — achado real: `expo-font` (peer dependency obrigatória de `@expo/vector-icons`) estava ausente do `package.json`, risco real de crash fora do Expo Go. Corrigido com `npx expo install expo-font` → 18/20. Os 2 restantes são conhecidos e não corrigidos de propósito (especificação, seção 3: "não atualizar dependências em massa sem necessidade demonstrada"):
  - Config do prebuild (android/ios/ presentes, `app.json` tem `orientation`/`android`/`plugins` que o EAS Build não sincroniza automaticamente nesse modo) — informativo, não bloqueante.
  - Patch versions disponíveis (`expo`, `expo-dev-client`, `expo-file-system`, `expo-sqlite`) — não atualizadas sem necessidade demonstrada.
- **`src/storage/catalogSync.js`/`catalogIndex.js`/`catalogSyncDecision.js` inspecionados antes de qualquer alteração.** Achado real crítico: o schema que `catalogIndex.js` esperava (`category`, `rarity`, `dex_ids`) **não batia** com o schema real que `scripts/sync-full-catalog.js` gera (`set_official`, `set_total`, `set_printed_code` — sem `category`/`rarity`/`dex_ids`), e o nome do arquivo também divergia (`poc_catalog_index.db` vs `dexbinder_catalog.db`). Confirmado baixando o `catalog.db` publicado de verdade e inspecionando `sqlite_master` com `better-sqlite3`:
  ```sql
  CREATE TABLE card_index (
    source_card_id TEXT NOT NULL, source_language TEXT NOT NULL, name TEXT,
    local_id TEXT, set_id TEXT, set_name TEXT, set_serie_id TEXT,
    set_official INTEGER, set_total INTEGER, set_printed_code TEXT,
    has_image INTEGER, image_base_url TEXT,
    PRIMARY KEY (source_card_id, source_language)
  );
  CREATE TABLE synced_pairs (set_id TEXT, lang TEXT, synced_at TEXT, card_count INTEGER, PRIMARY KEY (set_id, lang));
  CREATE TABLE not_found_pairs (set_id TEXT, lang TEXT, checked_at TEXT, PRIMARY KEY (set_id, lang));
  ```
- **Estado real do workflow/manifesto publicado (checado de novo ao escrever este relatório, 25/10/2026 ~16h UTC):**
  ```json
  {
    "generatedAt": "2026-10-25T16:00:07.627Z",
    "targetPairs": 1100, "syncedPairs": 176, "notFoundPairs": 188,
    "remainingPairs": 736, "complete": false, "totalRecords": 11421
  }
  ```
  **Sincronização PARCIAL** (não completa) — 364/1100 pares set×idioma resolvidos, 11.421 cartas reais já no banco publicado (1.46MB+ e crescendo). `catalog-thumbnails` (miniaturas) **ainda não existe** — gated corretamente até os metadados completarem (ver `reports/decision.md`, seção 11.3).
- **Modo de amostra usado para inspecionar** (não varri o catálogo nem baixei imagens em massa): 1 download real do `catalog.db` publicado (1.46MB) para inspeção de schema, descartado depois.

## 2. Arquitetura implementada

```
Release pública "catalog-data" (GitHub, sem auth)
  ├── catalog-version.json  (manifesto: dbSha256, complete, totalRecords, ...)
  └── catalog.db            (SQLite: card_index + synced_pairs + not_found_pairs)
         │
         │  fetch (manifesto) → compara checksum (catalogSyncDecision.shouldUpdate)
         ▼
src/storage/catalogSync.js (ensureCatalogReady)
  1. CHECKING  — consulta manifesto público, compara com o local
  2. (sem rede + sem banco local) → ERROR_RECOVERABLE, mensagem clara
  3. (sem rede + banco local existe) → OFFLINE_USING_LOCAL, usa o que já tem
  4. (checksum igual) → READY, não baixa de novo
  5. (checksum diferente) → DOWNLOADING → baixa pra ARQUIVO TEMPORÁRIO
     → VALIDATING → checksum real (File.digest) + integridade SQLite real
     → se OK: instala ATOMICAMENTE (File.move) → READY
     → se falhar: descarta o temporário, banco anterior intocado
         │
         ▼
src/storage/catalogIndex.js — abre o banco instalado, consultas SQL
  (searchByName/searchByNumber/searchBySet/getCardDetail/listSets/listLanguages)
         │
         ▼
src/catalog/catalogRepository.js — camada única pra UI/scanner
  - filtra física/digital/não-confirmada (physicalClassification.js)
  - cache em memória dos registros físicos (getAllPhysicalRecords)
  - getScannerCandidates() → rankCandidates() SEM ALTERAÇÃO (Entrega 0)
         │
         ▼
app/index.jsx (aba "Garimpo") — bloqueia scanner/busca manual até
catalogUsable (status "ready" ou "offline_using_local")
```

Pokédex Nacional é independente disso: `scripts/build-national-dex.js` (rodado uma vez, PokeAPI) gera `app/assets/data/national-dex.json`, consumido direto por `app/screens/PokedexScreen.jsx` — sem relação com o catálogo de cartas.

## 3. Achados reais de bugs (3, todos corrigidos)

### 3.1. Schema divergente (achado por inspeção, antes de ligar à UI)
Ver seção 1. `catalogIndex.js` foi reescrito para o schema real; a lógica de mapeamento de linha foi extraída para `src/storage/catalogRowMapping.js` (pura, testada com uma linha REAL do `catalog.db` publicado como fixture).

### 3.2. "URI is not absolute" (achado em Android físico real, 1º teste)
`defaultDatabaseDirectory` (expo-sqlite) é um **path cru** de sistema de arquivos (ex. `/data/data/com.dexbinder.pocscanner/files/SQLite`), não uma URI `file://`. Usado direto no construtor de `File`/`Directory` do `expo-file-system` (que exige URI), quebrava com:
```
java.lang.IllegalArgumentException: URI is not absolute
  at expo.modules.filesystem.FileSystemFile.getExists(FileSystemFile.kt:38)
```
Corrigido: `src/storage/pathUtils.js` (`toFileUri()`, pura, testada) converte só para uso com `File`/`Directory`; `openDatabaseAsync()` continua recebendo o path cru (confirmado em `expo-sqlite/build/pathUtils.js` que é isso que ele espera).

### 3.3. "ENOENT: No such file or directory" (achado em Android físico real, 2ª tentativa, app novo)
O diretório `SQLite/` só é criado pelo expo-sqlite na 1ª vez que ele abre/cria um banco nele. Como o download acontecia **antes** de qualquer `openDatabaseAsync()`, instalações novas (app nunca aberto antes) falhavam:
```
Call to function 'FileSystem.downloadFileAsync' has been rejected.
→ Caused by: java.io.FileNotFoundException: .../files/SQLite/dexbinder_catalog.download.db: open failed: ENOENT
```
Corrigido: `new Directory(DB_DIRECTORY_URI).create({ intermediates: true, idempotent: true })` antes do download.

### 3.4. UI: título colado na barra de status, abas coladas na barra de gestos (reportado pelo usuário, com prints reais)
`SafeAreaView` do núcleo do React Native está depreciado e não respeitava as áreas seguras no aparelho de teste. **Decisão do usuário** (perguntado explicitamente: correção rápida sem dependência nova vs. solução oficial com rebuild): optou pela solução oficial. Instalado `react-native-safe-area-context` (padrão recomendado pelo próprio aviso de depreciação), aplicado em todas as telas e na barra de abas. Exige APK novo de dev-client (módulo nativo) — build disparado via `.github/workflows/build-android-dev.yml`, run `40210375798` (ver seção 6 para o resultado).

## 4. Cadastro mestre da Pokédex Nacional

- **Fonte avaliada e escolhida:** PokeAPI (`https://pokeapi.co/api/v2/pokemon-species/`). Confirmado por chamada real: exatamente 1025 espécies, batendo com a meta da especificação.
- **Licença/atribuição:** API livre, sem autenticação, "Fair Use Policy" (cache local, uso moderado — respeitado: gerado uma vez, versionado, nunca consultado de novo em runtime). Dados comunitários, sem vínculo oficial com Nintendo/Game Freak/Creatures — mesma categoria de uso já documentada para o TCGdex neste projeto (`reports/decision.md`). Avaliação de direitos pra uso comercial continua fora do escopo técnico.
- **Achado real:** a PokeAPI **não tem nomes de espécie em português** (nem `pt` nem `pt-br`) — confirmado consultando a API de verdade (espécie #1, idiomas presentes: `de, en, es, es-419, fr, it, ja, ja-hrkt, ja-roma, ko, zh-hans, zh-hant` — sem `pt`/`pt-br`). Documentado no arquivo gerado (`knownLimitations`) e aqui — não contornado nem inventado.
- **Arquivo gerado:** `app/assets/data/national-dex.json` (1025 espécies, idiomas en/fr/de/es/it/ja, 260KB). Campos: `source`, `sourceDescription`, `generatedAt`, `totalSpecies`, `languages`, `checksum` (SHA-256 do array `species`), `knownLimitations`, `species[]` (`nationalNumber`, `slug`, `names`).
- **Validação:** `src/data/nationalDexValidation.js` — contagem (1025), unicidade de `nationalNumber`, lacunas no intervalo 1-1025 (nenhuma), nomes em inglês vazios (nenhum), checksum íntegro. Rodada tanto no próprio script de geração (falha e não salva se inválido) quanto em 10 testes automatizados (`npm run test:national-dex`), incluindo casos de referência reais (#1 Bulbasaur, #25 Pikachu, #150 Mewtwo, #1025 Pecharunt).
- **Associação carta→espécie:** NÃO implementada de forma confiável nesta entrega — limitação documentada, não escondida. O banco sincronizado (`scripts/sync-full-catalog.js`) usa a forma resumida da API (`id`/`image`/`localId`/`name` por set), que não traz `dexId`; buscar isso por carta reintroduziria uma chamada HTTP por carta (o problema que a sincronização por set resolveu). `CatalogRepository.searchByPokemon()` existe (a capacidade está na arquitetura, como a especificação pede) mas é um best-effort por nome, com cada resultado explicitamente marcado `speciesAssociationConfirmed: false`.

## 5. Testes automatizados — comandos e saídas reais

```
$ npm test
test:matching                 # tests 36, pass 36, fail 0  (Entrega 0, inalterado)
test:catalog-sync             # tests 4,  pass 4,  fail 0  (shouldUpdate - Entrega 0)
test:cron-switch              # tests 4,  pass 4,  fail 0  (Entrega 0, inalterado)
test:physical-classification  # tests 5,  pass 5,  fail 0  (NOVO — inclui caso B2-001/tcgp da especificação)
test:catalog-install-decision # tests 6,  pass 6,  fail 0  (NOVO — checksum/integridade)
test:catalog-row-mapping      # tests 6,  pass 6,  fail 0  (NOVO — linha real do catalog.db)
test:catalog-index-query      # tests 13, pass 13, fail 0  (NOVO — integração real contra SQLite)
test:catalog-repository       # tests 10, pass 10, fail 0  (NOVO — integração real, física/digital/scanner)
test:national-dex             # tests 10, pass 10, fail 0  (NOVO — arquivo real gerado, 1025 espécies)
test:path-utils               # tests 2,  pass 2,  fail 0  (NOVO — trava o bug #3.2)
check:jsx                       OK: App.js, app/index.jsx, app/theme.js, app/Navigation.jsx,
                                 app/components/AppButton.jsx, app/components/CatalogStatusBanner.jsx,
                                 app/screens/{Home,Ficharios,Pokedex,Inventario}Screen.jsx

TOTAL: 96/96 testes + checagem JSX, 0 falhas
```

**Testes de integração reais (não mocks):** `test:catalog-index-query` e `test:catalog-repository` rodam contra SQLite de verdade (`better-sqlite3` em memória, adaptado pra expor a mesma interface assíncrona do `expo-sqlite` real — `getAllAsync`/`getFirstAsync`), com linhas de fixture reais copiadas do `catalog.db` publicado. `test:catalog-repository` confirma, de ponta a ponta, que uma carta de série `tcgp` (caso de referência `B2-001` da especificação) nunca aparece como física elegível em nenhum método do repositório (`getAllPhysicalRecords`, `searchByName`, `getScannerCandidates`).

## 6. Testes em dispositivo físico (Android real)

| Item | Status | Evidência |
|---|---|---|
| Bundle Metro monta sem erro (906+ módulos) | ✅ EXECUTADO | `curl` real contra `/node_modules/expo/AppEntry.bundle`, HTTP 200, confirmado 4x após cada fix |
| Conexão real com manifesto público (sem mock) | ✅ EXECUTADO | `fetch` real contra a URL exata usada por `catalogSync.js`, HTTP 200, shape confirmado |
| Abertura do app, navegação entre as 5 abas | ✅ EXECUTADO | Prints reais do usuário (Home, com as 5 abas visíveis) |
| Detecção de catálogo ausente + tentativa de sincronizar | ✅ EXECUTADO (revelou bugs 3.2 e 3.3, corrigidos) | Prints reais + logs do Metro em tempo real |
| Catálogo completo instalado com sucesso em dispositivo (app novo, com os 3 fixes da seção 3) | ✅ EXECUTADO | Usuário confirmou: catálogo sincronizando no app real, contagem de cartas visível na tela |
| Atualização automática (checksum novo detectado e baixado de novo) | ✅ EXECUTADO | Contagem no dispositivo subiu de ~11.000 para 13.191 entre duas checagens do usuário — conferido batendo exatamente com o manifesto publicado real no mesmo momento (`totalRecords: 13191`, `generatedAt: 2026-10-25T18:54:13.962Z`) |
| Título colado na barra de status / abas coladas na barra de gestos | ✅ CORRIGIDO E CONFIRMADO | Usuário confirmou: "a distância do cabeçalho e rodapé ficaram ótimas" |
| Abertura do app, navegação entre as 5 abas | ✅ EXECUTADO | Prints reais do usuário (Home, com as 5 abas visíveis) |
| Scanner usando o catálogo completo (não as 58 cartas de teste) | ⏳ NÃO EXECUTADO AINDA | Catálogo instalado e sincronizando; scanner/busca manual ainda não testados pelo usuário |
| Pesquisa manual no catálogo completo | ⏳ NÃO EXECUTADO AINDA | — |
| Modo avião após instalar — pesquisa local offline | ⏳ NÃO EXECUTADO AINDA | — |
| Falha de atualização mantém banco anterior | ⏳ NÃO EXECUTADO (não simulado em dispositivo; lógica testada em Node — seção 5) | — |

**Protocolo formal da câmera (especificação principal, 30 impressões/60 fotos) continua PENDENTE**, como já documentado em `reports/decision.md` e no CSV. Esta entrega não tentou avançar isso — os 23 testes informais reais já registrados (`reports/ocr-test-results.csv`) continuam sendo o tamanho de amostra atual.

## 7. Veredito por área

| Área | Veredito | Observação |
|---|---|---|
| Sincronização segura do catálogo (checksum + integridade + instalação atômica) | **GO** | Lógica testada (Node) + confirmada end-to-end em dispositivo físico real: instalação inicial E atualização automática (checksum novo detectado, catálogo cresceu de ~11.000 para 13.191 registros no aparelho, batendo exato com o manifesto publicado) |
| CatalogRepository / pesquisa local | **GO COM LIMITAÇÕES** | 23 testes de integração reais passando; catálogo completo confirmado instalado no dispositivo; busca manual/scanner ainda não exercidos pelo usuário |
| Filtro física/digital/não-confirmada | **GO** | Testado (caso B2-001 da especificação), inclusive integração completa via CatalogRepository |
| Cadastro mestre da Pokédex Nacional | **GO COM LIMITAÇÕES** | 1025 espécies reais, validadas, testadas; sem nomes em português (limitação real da fonte, documentada); associação carta→espécie não confiável (documentado, não escondido) |
| Scanner ligado ao catálogo completo | **NÃO EXECUTADO (verificação em dispositivo)** | Código implementado e revisado; catálogo já instalado no aparelho, falta só o usuário testar a captura/identificação |
| Navegação de 5 áreas / áreas seguras | **GO** | Confirmado em dispositivo real: 5 abas navegáveis, título/abas não colam mais na barra de status/gestos (usuário confirmou após o APK novo) |
| Protocolo formal de câmera/OCR (especificação principal) | **NÃO EXECUTADO** | Fora do escopo desta entrega — pendência pré-existente, não escondida |

## 8. Pendências / próximos passos imediatos

1. ~~Confirmar o build `40210375798` e reinstalar o APK no celular do usuário.~~ ✅ Feito — build confirmado (10m22s), APK entregue, instalado, testado.
2. ~~Testar instalação completa do catálogo com o APK novo.~~ ✅ Confirmado: catálogo sincronizando e atualizando corretamente em dispositivo real (seção 6).
3. Testar, ainda pendente: scanner (captura + identificação) contra o catálogo completo, busca manual, modo avião.
4. Protocolo formal de câmera/OCR (30 impressões/60 fotos, especificação principal) continua fora do escopo desta entrega.

## 9. Arquivos alterados nesta entrega

32 arquivos (14.479 inserções, 246 remoções) em 6 commits (`955d2db`..`56f01b8`). Principais:

- **Novo — storage/catálogo:** `src/storage/{catalogInstallDecision,catalogRowMapping,pathUtils,physicalClassification}.js`, `src/catalog/catalogRepository.js`, `src/data/nationalDexValidation.js`
- **Reescrito — storage/catálogo:** `src/storage/catalogSync.js`, `src/storage/catalogIndex.js`
- **Novo — Pokédex:** `scripts/build-national-dex.js`, `app/assets/data/national-dex.json`
- **Novo — navegação/UI:** `app/Navigation.jsx`, `app/theme.js`, `app/components/{AppButton,CatalogStatusBanner}.jsx`, `app/screens/{Home,Ficharios,Pokedex,Inventario}Screen.jsx`
- **Alterado — scanner:** `app/index.jsx` (catálogo completo + gate de sincronização + safe-area), `App.js` (navegação + SafeAreaProvider)
- **Novo — testes:** `scripts/run-{physical-classification,catalog-install-decision,catalog-row-mapping,catalog-index-query,catalog-repository,national-dex,path-utils}-tests.js`
- **Dependências:** `+expo-font`, `+react-native-safe-area-context` (ambas via `npx expo install`, versões corretas do SDK 58)
- **Docs:** `README.md` (instalação, catálogo inicial/atualização/offline, troubleshooting), `app.json` (plugin `expo-font` auto-adicionado)

## 10. Fora do escopo desta entrega (confirmado, não implementado)

Conforme especificação, seção 8: login/autenticação, Supabase/sync entre dispositivos, CRUD completo de fichários/checklist, registro de compras/vendas, gestão de exemplares físicos/transferência, notificações/scanner em lote/preços, publicação em lojas, uso comercial de marcas/imagens Pokémon. Nenhum desses foi iniciado.
