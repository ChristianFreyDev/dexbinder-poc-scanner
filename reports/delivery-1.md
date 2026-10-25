# DexBinder — Entrega 1: Relatório de entrega

**Data:** 25/10/2026
**Branch/commit inicial (baseline):** `master` @ `aa0e5587bc44a3d64825e5bba442074f901629ac`
**Commits desta entrega:** `955d2db` → `300ba9b` (14 commits, ver seção 9) — inclui testes reais completos em dispositivo físico e todas as correções que eles revelaram

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

## 3. Achados reais de bugs (9, todos corrigidos ou diagnosticados)

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
`SafeAreaView` do núcleo do React Native está depreciado e não respeitava as áreas seguras no aparelho de teste. **Decisão do usuário** (perguntado explicitamente: correção rápida sem dependência nova vs. solução oficial com rebuild): optou pela solução oficial. Instalado `react-native-safe-area-context` (padrão recomendado pelo próprio aviso de depreciação), aplicado em todas as telas e na barra de abas. Exige APK novo de dev-client (módulo nativo) — build disparado via `.github/workflows/build-android-dev.yml`, run `40210375798` (ver seção 6 para o resultado). **Confirmado pelo usuário**: "a distância do cabeçalho e rodapé ficaram ótimas".

### 3.5. "151" ainda não sincronizado + bug real de `--batch=0` (reportado pelo usuário escaneando cartas físicas)
Usuário testou o scanner com cartas reais do "151" e nenhum candidato correto apareceu. Investigado: `sv03.5`/`SV2a` ainda não tinham sido alcançados pela sincronização automática (posição 181 de 220 sets, só ~399/1100 pares resolvidos) — fila natural, não um bug. Com consentimento do usuário, sincronizado manualmente (mesmo mecanismo do workflow). Durante a correção, achado um bug real em `scripts/sync-full-catalog.js`: `args.batch ? ... : pendingPairs` tratava `--batch=0` como "sem limite" (0 é falsy em JS) em vez de "zero pares" — processou os 706 pares pendentes inteiros sem querer ao tentar só recalcular o manifesto. Interrompido a tempo (commits atômicos por par, nada corrompido), corrigido comparando com `!= null`. Ver `reports/decision.md`, seção 11.5/11.6 para o detalhe completo e os números reais publicados.

### 3.6. Gargalo real de performance: `rankCandidates()` levava 14-20 SEGUNDOS no celular
Medido de verdade em dispositivo físico (instrumentação temporária com `console.log`, removida depois): `rankCandidates()` rodando sobre as 21.828 cartas do catálogo completo levava 14.464ms/20.036ms/20.457ms no celular (Hermes) contra 76ms no desktop (V8) — ~200-270x mais lento, não só a diferença normal de hardware. SQLite (607ms) e OCR (3 chamadas nativas, ~600ms) não eram o gargalo. Corrigido com um pré-filtro via SQL (`CatalogRepository.getScannerCandidateRecords()`, novo, usa `catalogIndex.searchByNumber`/`searchByName`) ANTES de `rankCandidates()` rodar — que continua **sem nenhuma alteração** na lógica de pontuação. Resultado medido depois, no mesmo celular: ~0,9-1,3s por carta (confirmado pelo usuário: "ficou bem rápido agora. Cerca de 2 segundos").

### 3.7. Miniaturas lentas (3,5-34s cada) — diagnosticado como rede do usuário, não bug de código
Mesma instrumentação temporária. CDN do TCGdex respondeu em ~1s testada diretamente deste ambiente; usuário confirmou não ser a mesma rede/DNS que já tinha dado problema antes. Padrão de tempos crescentes (3,5s→34,4s) é consistente com banda limitada do lado do usuário, não um bug identificado. Mitigado com um indicador de carregamento na miniatura (antes ficava em branco); o sistema de miniaturas pequenas pré-empacotadas (seção 11.3 de `reports/decision.md`) resolveria de vez, mas continua gated até o catálogo completo de metadados terminar.

### 3.7b. Regressão própria: a mitigação do 3.7 quebrou o carregamento da imagem
Ao implementar o indicador de carregamento do 3.7, usei `StyleSheet.absoluteFillObject` (dimensão implícita) na `<Image>` da miniatura — exatamente a mesma classe de bug já documentada e corrigida antes no modal de imagem ampliada desta tela (Entrega 0, `reports/decision.md` seção 3.12): `<Image>` com dimensão implícita/"%" não renderiza de forma confiável neste RN/Android. Usuário confirmou em dispositivo físico, com internet normal: a imagem simplesmente parou de aparecer (nem o indicador mostrava). Corrigido com `width`/`height` explícitos (76x106, mesmos valores de `styles.candidateThumb`) — mesmo padrão já validado no modal. Confirmado pelo usuário depois: "agora carregou certinho".

### 3.8. UX: ordem de idioma em empate de confiança
Usuário notou que, em empate de score entre impressões da mesma carta, inglês sempre vinha primeiro (só por ser a 1ª língua processada pela sincronização, não uma escolha deliberada). Corrigido com `src/catalog/candidateOrdering.js` (pura, testada): reordena o resultado final de `rankCandidates()` pra priorizar português só em empate real, sem tocar na lógica de pontuação.

### 3.9. Busca manual por número puro não achava nada
Usuário testou a busca manual com "001", "025", "050" e nenhuma achou a carta certa (nem qualquer carta). Causa raiz: `handleManualSearch()` reusava `parseCardText()` (feito pro texto ruidoso do OCR), que exige prefixo de letra num número solto pra não confundir com ruído real de câmera — um "001" digitado de propósito não batia em nenhum padrão aceito, resultado: nenhum candidato. Corrigido com `src/scanner/parseManualQuery.js` (novo, puro, testado, 9 testes) — parser dedicado só pra texto digitado, sem essa exigência; `parseCardText.js` continua intocado (usado só no fluxo real da câmera). Validado contra o catálogo real: "025"/"050" passaram a achar o "151" certo; "Bulbasaur 001" achou `sv03.5-001` em 1º lugar. Achado adicional, **não um bug**: buscar só "001" ou só "Marowak" sozinho continua ambíguo de propósito (237 cartas reais numeradas "001" em sets diferentes; várias impressões reais de "Marowak" na história do TCG) — usuário confirmou, testando "Marowak 105", que combinar nome+número resolve.

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
test:matching                   # tests 36, pass 36, fail 0  (Entrega 0, inalterado)
test:catalog-sync               # tests 4,  pass 4,  fail 0  (shouldUpdate - Entrega 0)
test:cron-switch                # tests 4,  pass 4,  fail 0  (Entrega 0, inalterado)
test:physical-classification    # tests 5,  pass 5,  fail 0  (inclui caso B2-001/tcgp da especificação)
test:catalog-install-decision   # tests 6,  pass 6,  fail 0  (checksum/integridade)
test:catalog-row-mapping        # tests 6,  pass 6,  fail 0  (linha real do catalog.db)
test:catalog-index-query        # tests 13, pass 13, fail 0  (integração real contra SQLite)
test:catalog-repository         # tests 14, pass 14, fail 0  (integração real, física/digital/scanner/pré-filtro/idioma)
test:national-dex               # tests 10, pass 10, fail 0  (arquivo real gerado, 1025 espécies)
test:path-utils                 # tests 2,  pass 2,  fail 0  (trava o bug #3.2)
test:scanner-candidate-search   # tests 6,  pass 6,  fail 0  (pré-filtro número/nome, achado de performance #3.6)
test:candidate-ordering         # tests 7,  pass 7,  fail 0  (prioridade de idioma em empate, achado #3.8)
test:parse-manual-query         # tests 9,  pass 9,  fail 0  (busca manual por número puro, achado #3.9)
check:jsx                         OK: App.js, app/index.jsx, app/theme.js, app/Navigation.jsx,
                                   app/components/AppButton.jsx, app/components/CatalogStatusBanner.jsx,
                                   app/screens/{Home,Ficharios,Pokedex,Inventario}Screen.jsx

TOTAL: 122/122 testes + checagem JSX, 0 falhas
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
| Scanner usando o catálogo completo (não as 58 cartas de teste) | ✅ EXECUTADO | Usuário escaneou cartas reais do "151" (depois do fix 3.5) e o candidato correto apareceu |
| Performance do scanner (captura → candidatos) | ✅ EXECUTADO, CORRIGIDO | Medido 14-20s real antes do fix 3.6; confirmado pelo usuário depois: "ficou bem rápido agora. Cerca de 2 segundos" |
| Ordenação por idioma em empate de confiança | ✅ EXECUTADO, CORRIGIDO | Usuário reportou inglês sempre primeiro em empate; corrigido (3.8) e testado (7 testes) |
| Pesquisa manual no catálogo completo | ✅ EXECUTADO, CORRIGIDO | Achado real (3.9): busca por número puro ("001") não achava nada — corrigido com parser dedicado; "025"/"050"/"Bulbasaur 001"/"Marowak 105" confirmados funcionando pelo usuário |
| Modo avião após instalar — pesquisa local offline | ✅ EXECUTADO | Usuário confirmou: "está bem rápido e preciso" |
| Falha de atualização mantém banco anterior | ⏳ NÃO EXECUTADO (não simulado em dispositivo; lógica testada em Node — seção 5) | — |
| Carregamento de miniaturas de imagem | ⚠️ LENTO, DIAGNOSTICADO COMO REDE DO USUÁRIO | 3,5-34s por imagem medido; CDN rápida testada daqui; não é bug de código identificado (ver 3.7) — indicador de carregamento adicionado (e sua própria regressão real corrigida, ver 3.7b) |

**Protocolo formal da câmera (especificação principal, 30 impressões/60 fotos) continua PENDENTE**, como já documentado em `reports/decision.md` e no CSV. Esta entrega não tentou avançar isso — os 23 testes informais reais já registrados (`reports/ocr-test-results.csv`) continuam sendo o tamanho de amostra atual.

## 7. Veredito por área

| Área | Veredito | Observação |
|---|---|---|
| Sincronização segura do catálogo (checksum + integridade + instalação atômica) | **GO** | Lógica testada (Node) + confirmada end-to-end em dispositivo físico real: instalação inicial E atualização automática (checksum novo detectado, catálogo cresceu de ~11.000 para 13.191 registros no aparelho, batendo exato com o manifesto publicado) |
| CatalogRepository / pesquisa local (scanner + busca manual) | **GO** | 27 testes de integração reais + 22 de lógica pura associada (pré-filtro, idioma, parser de busca manual); catálogo completo, scanner, busca manual e modo offline confirmados em dispositivo real |
| Filtro física/digital/não-confirmada | **GO** | Testado (caso B2-001 da especificação), inclusive integração completa via CatalogRepository |
| Cadastro mestre da Pokédex Nacional | **GO COM LIMITAÇÕES** | 1025 espécies reais, validadas, testadas; sem nomes em português (limitação real da fonte, documentada); associação carta→espécie não confiável (documentado, não escondido) |
| Scanner ligado ao catálogo completo | **GO** | Confirmado em dispositivo físico real: identifica cartas do "151" corretamente, ~1-2s por carta (depois do fix de performance), ordenação por idioma corrigida |
| Navegação de 5 áreas / áreas seguras | **GO** | Confirmado em dispositivo real: 5 abas navegáveis, título/abas não colam mais na barra de status/gestos (usuário confirmou após o APK novo) |
| Carregamento de imagens das miniaturas | **GO COM LIMITAÇÕES** | Lento (3,5-34s) numa rede específica do usuário, diagnosticado como limitação de rede/throughput do lado do cliente, não um bug de código identificado; indicador de carregamento adicionado; sistema de miniaturas leves (seção 11.3 de decision.md) resolveria, ainda não disponível |
| Protocolo formal de câmera/OCR (especificação principal) | **NÃO EXECUTADO** | Fora do escopo desta entrega — pendência pré-existente, não escondida |

## 8. Pendências / próximos passos imediatos

1. ~~Confirmar o build `40210375798` e reinstalar o APK no celular do usuário.~~ ✅ Feito.
2. ~~Testar instalação completa do catálogo com o APK novo.~~ ✅ Confirmado em dispositivo real.
3. ~~Testar scanner (captura + identificação) contra o catálogo completo.~~ ✅ Confirmado — achou a carta certa do "151" depois do fix 3.5, em ~1-2s depois do fix de performance (3.6).
4. ~~Testar busca manual (texto) e modo avião (offline).~~ ✅ Confirmados — busca manual corrigida (3.9), modo avião "rápido e preciso" (confirmação do usuário).
5. Ainda pendente (menor prioridade, não bloqueante): simular falha de atualização em dispositivo (lógica já testada em Node).
6. `SV2a` (versão japonesa do "151") não está no mapa set→série — nunca será sincronizada automaticamente (achado 11.5 de `decision.md`); não corrigido, fora do escopo imediato (cartas do usuário não são japonesas).
7. Sistema de miniaturas leves pré-empacotadas continua gated até o catálogo completo de metadados terminar (dias, no ritmo atual) — resolveria o achado 3.7 de vez.
8. Protocolo formal de câmera/OCR (30 impressões/60 fotos, especificação principal) continua fora do escopo desta entrega.

## 9. Arquivos alterados nesta entrega

~42 arquivos em 14 commits (`955d2db`..`300ba9b`), incluindo todas as correções pós-teste em dispositivo físico real (seções 3.5-3.9). Principais:

- **Novo — storage/catálogo:** `src/storage/{catalogInstallDecision,catalogRowMapping,pathUtils,physicalClassification}.js`, `src/catalog/{catalogRepository,scannerCandidateSearch,candidateOrdering}.js`, `src/data/nationalDexValidation.js`
- **Reescrito — storage/catálogo:** `src/storage/catalogSync.js`, `src/storage/catalogIndex.js`
- **Novo — Pokédex:** `scripts/build-national-dex.js`, `app/assets/data/national-dex.json`
- **Novo — navegação/UI:** `app/Navigation.jsx`, `app/theme.js`, `app/components/{AppButton,CatalogStatusBanner}.jsx`, `app/screens/{Home,Ficharios,Pokedex,Inventario}Screen.jsx`
- **Alterado — scanner:** `app/index.jsx` (catálogo completo + gate de sincronização + safe-area + indicador de carregamento de imagem), `App.js` (navegação + SafeAreaProvider)
- **Novo — testes:** `scripts/run-{physical-classification,catalog-install-decision,catalog-row-mapping,catalog-index-query,catalog-repository,national-dex,path-utils,scanner-candidate-search,candidate-ordering,parse-manual-query}-tests.js`
- **Novo — busca manual:** `src/scanner/parseManualQuery.js` (achado 3.9)
- **Correção:** `scripts/sync-full-catalog.js` (bug real de `--batch=0`, seção 3.5)
- **Dependências:** `+expo-font`, `+react-native-safe-area-context` (ambas via `npx expo install`, versões corretas do SDK 58)
- **Docs:** `README.md` (instalação, catálogo inicial/atualização/offline, troubleshooting), `app.json` (plugin `expo-font` auto-adicionado), `reports/decision.md` (seções 11.5/11.6 com os achados reais pós-teste)

## 10. Fora do escopo desta entrega (confirmado, não implementado)

Conforme especificação, seção 8: login/autenticação, Supabase/sync entre dispositivos, CRUD completo de fichários/checklist, registro de compras/vendas, gestão de exemplares físicos/transferência, notificações/scanner em lote/preços, publicação em lojas, uso comercial de marcas/imagens Pokémon. Nenhum desses foi iniciado.
