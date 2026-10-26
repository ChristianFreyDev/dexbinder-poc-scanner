# poc-catalog-scanner — DexBinder

Este repositório tem três camadas:

- **Entrega 0** — uma PoC isolada e descartável que respondeu, com evidência real, se o catálogo TCGdex serve como base confiável e se câmera+OCR no dispositivo geram candidatos úteis. Relatório completo: [`reports/decision.md`](reports/decision.md).
- **Entrega 1** — primeira base real do app: catálogo completo sincronizado e pesquisável localmente, cadastro mestre da Pokédex Nacional (1025 espécies), navegação de 5 áreas, e o scanner da Entrega 0 ligado ao catálogo completo (sem mais o bundle de teste de 58 cartas). Relatório completo: [`reports/delivery-1.md`](reports/delivery-1.md).
- **Entrega 2** (atual) — persistência local pessoal (SQLite próprio, separado do catálogo público): CRUD de fichários, geração/edição de checklists, registro individual de cópias físicas com localização por página/bolso, progresso real de fichário/Pokédex global/inventário, e integração do estado da coleção ao resultado confirmado do Garimpo. Relatório completo: [`reports/delivery-2.md`](reports/delivery-2.md).

**Leia primeiro:** [`reports/delivery-2.md`](reports/delivery-2.md) para o estado atual (o que está pronto, o que não está, veredito por área), [`reports/delivery-1.md`](reports/delivery-1.md) para o histórico da Entrega 1 e [`reports/decision.md`](reports/decision.md) para o histórico/validação original da Entrega 0.

## O que roda agora, sem nenhum dispositivo Android

```bash
npm install

# Reexecuta a auditoria real do catálogo TCGdex (consultas HTTP reais, não mocks)
npm run audit:catalog

# Reconstrói o mapa real set->série (consulta a API TCGdex de verdade) — necessário
# para o filtro de séries digitais (TCG Pocket) funcionar
npm run build:series-map

# Gera o bundle único do índice local (app/assets/catalog-index.json) a partir das
# fixtures + do mapa de séries, já com o TCG Pocket filtrado — histórico da Entrega 0
npm run build:index-bundle

# Regera o cadastro mestre da Pokédex Nacional (app/assets/data/national-dex.json),
# consultando a PokeAPI de verdade (1025 espécies) — só precisa rodar de novo se a
# fonte mudar; o arquivo já vem pronto/versionado no repositório
npm run build:national-dex

# Roda os 36 testes automatizados da lógica de reconhecimento/ranking/filtro,
# incluindo testes de regressão com texto OCR real transcrito de fotos físicas
npm run test:matching

# Verifica a sintaxe JSX/JS real do app (sem precisar instalar o React Native inteiro)
npm run check:jsx

# Tudo junto: 226 testes (matching, sincronização/instalação do catálogo, consultas,
# repositório de catálogo, Pokédex Nacional, identidade de carta, migrações/repositórios
# pessoais da Entrega 2, cálculos de progresso, geração de checklist, elegibilidade de
# expansão) + checagem de sintaxe JSX
npm test
```

Nenhum desses comandos precisa de Android SDK, JDK, emulador ou câmera.

## Verificações de config/build que não precisam de Android físico

```bash
npx expo-doctor          # 18/20 checks reais passando (25/10/2026) — os 2 restantes são conhecidos/documentados:
                          # sync de config do prebuild (android/ios/ presentes) e patch versions que não
                          # atualizamos em massa sem necessidade (ver reports/delivery-1.md)
npx expo prebuild --platform android --no-install   # já executado; gera android/ (config, permissões, plugin OCR aplicados)
npx react-native config  # confirma que o rn-mlkit-ocr é descoberto pelo autolinking
```

O diretório `android/` já está gerado neste repositório (saída real de `expo prebuild`) — confirme com `cat android/app/src/main/AndroidManifest.xml` que a permissão de câmera foi injetada, e com `cat android/build.gradle` que o plugin do `rn-mlkit-ocr` configurou `ocrModels`/`ocrUseBundled`.

## Testado em Android físico real, com cartas físicas reais

Captura de câmera, recorte de imagem e OCR real (`rn-mlkit-ocr`) exigem a development build nativa — não funcionam no Expo Go. Já foi gerado um build de dev-client (GitHub Actions, `.github/workflows/build-android-dev.yml`) e testado num celular físico em casa: captura, rotação manual, OCR e identificação de carta funcionando de ponta a ponta com cartas reais (ver `reports/decision.md`, seção 3.12, e `reports/ocr-test-results.csv` para os dados reais coletados).

Para iterar rapidamente sem gerar um APK novo a cada mudança, o app usa **Expo Dev Client com hot reload**: o celular (com o dev-client instalado) e o computador precisam estar na mesma rede Wi-Fi.

```bash
npx expo start              # sobe o Metro; abra o app no celular conectado na mesma Wi-Fi
```

Um APK de dev-client novo só é necessário quando uma dependência NATIVA nova é adicionada (ex.: `@expo/vector-icons`, que usa `expo-font`, já incluído — não exigiu rebuild). Para gerar um build standalone (sem hot reload), ou um dev-client novo após uma dependência nativa real:

```bash
npx expo run:android                             # requer Android Studio/SDK configurado na máquina
# ou, via GitHub Actions (sem precisar de SDK local):
#   build-android.yml      → APK standalone (release)
#   build-android-dev.yml  → APK de dev-client (debug, conecta ao Metro)
```

Para completar o protocolo formal da especificação (dataset de 60 fotos/30 impressões, seção 16.3), siga o runbook na seção 7 de [`reports/decision.md`](reports/decision.md).

## Entrega 1: o app usando o catálogo completo

### Catálogo inicial e atualização

Na primeira abertura, o app (aba qualquer — a sincronização é centralizada em `src/catalog/catalogRepository.js`) baixa o catálogo completo publicado (sem nenhuma credencial — a Release `catalog-data` é pública):

1. Consulta o manifesto público (`catalog-version.json`) e compara o checksum (`dbSha256`) com o que já está instalado (se houver).
2. Se for diferente, baixa o banco (`catalog.db`) para um arquivo **temporário**, valida o checksum E a integridade SQLite real antes de instalar.
3. Só substitui o banco anterior se as duas validações passarem — nunca sobrescreve um banco válido por um arquivo parcial/corrompido. Se a validação falhar, o banco anterior continua funcionando normalmente.

Estados visíveis na interface (`CatalogStatusBanner`, usado na Home e na aba Garimpo): `não instalado`, `verificando`, `baixando`, `validando`, `pronto`, `offline usando catálogo local`, `erro recuperável` (com botão "tentar de novo").

### Uso offline

Depois da primeira instalação bem-sucedida, pesquisa e scanner funcionam **sem internet** — o app nunca consulta a API do TCGdex em tempo real (só o banco SQLite local já baixado). Sem catálogo instalado E sem internet, o app mostra uma mensagem clara em vez de fingir que carregou.

### Solução de problemas

- **"Unable to resolve module expo-font" (ou qualquer módulo recém-instalado)**: o Metro estava rodando antes do `npm install`/`npx expo install` — reinicie `npx expo start`.
- **Catálogo preso em "baixando"/"validando" por muito tempo**: confira a conexão; o banco já passa de 1MB e cresce a cada sincronização do workflow. Use "tentar de novo" na Home.
- **Scanner/busca manual bloqueados**: são bloqueados de propósito até o catálogo ficar `pronto` ou `offline usando catálogo local` (nunca rodam contra um catálogo parcial/inexistente).

### Sincronização automática do catálogo completo (fora do app, já rodando)

Além do bundle estático de 58 cartas da Entrega 0 (mantido só como histórico/teste — não é mais usado pelo app real), existe a base real da arquitetura de catálogo completo (ver `reports/decision.md`, seções 11/11.1/11.2): um workflow (`.github/workflows/sync-catalog.yml`) roda de hora em hora, buscando um lote do catálogo completo (todos os sets, todos os idiomas) direto da API do TCGdex, retomando de onde parou a cada execução, e publicando o progresso como assets da Release `catalog-data` deste repositório. Scripts por trás disso:

```bash
# Gera/atualiza o banco SQLite do catálogo completo (dist/catalog/catalog.db)
npm run sync:full-catalog -- --full --resume --batch=25

# Gera miniaturas pequenas pré-empacotadas (dist/catalog/thumbnails/), a partir do banco acima
node scripts/build-thumbnails.js --limit=20   # amostra; use --full para todas (download pesado, combinar antes)

# Versão resumível/automatizável do mesmo processo (usada pelo workflow sync-thumbnails.yml):
# empacota as miniaturas como BLOBs num único banco SQLite (dist/catalog/thumbnails.db),
# uma por IDIOMA IMPRESSO de cada carta, em lotes, retomando de onde parou.
node scripts/sync-thumbnails.js --resume --batch=40
```

Todos têm modo de amostra pequena por padrão (sem `--full`/`--batch`) — seguros de rodar localmente para testar sem varrer o catálogo inteiro.

**Miniaturas (`.github/workflows/sync-thumbnails.yml`, novo)**: roda de hora em hora, mas só baixa imagem de verdade DEPOIS que o banco de metadados completar o primeiro ciclo inteiro (checa o manifesto publicado por `sync-catalog.yml` antes de fazer qualquer coisa — enquanto não completar, cada execução só faz essa checagem e não baixa nenhuma imagem). Publica o progresso como assets da Release `catalog-thumbnails` deste repositório, mesmo padrão resumível/idempotente do sync de metadados.

**CI automático**: `.github/workflows/test.yml` roda `npm test` (hoje 226 testes + checagem JSX) a cada push/PR em `master`.

**Redução automática da frequência**: quando o manifesto marca `complete: true` pela primeira vez (todos os pares set×idioma sincronizados), o próprio workflow `sync-catalog.yml` reduz sua cadência de hora em hora pra cada 3 dias sozinho — editando e commitando seu próprio cron (`scripts/maybe-slow-down-cron.js`, lógica testada em `src/automation/cronSwitch.js`). Não depende de ninguém lembrar de editar o YAML na mão.

**Repositório público**: tornado público em 23/10/2026 (ver `reports/decision.md`, seção 11.3) porque o app precisa baixar os assets da Release `catalog-data` sem autenticação — um app publicado não pode ter um token do GitHub embutido só pra isso. Histórico conferido antes: nenhum segredo encontrado.

**`src/storage/catalogSync.js`**: baixa/valida/instala o banco publicado com segurança (`ensureCatalogReady()`, `downloadAndInstallCatalog()`, `checkForUpdate()`, `openSyncedCatalogDb()`), usando `expo-file-system` + `expo-sqlite`. **`src/storage/catalogIndex.js`**: consultas SQL sobre o banco instalado (schema real: `source_card_id, source_language, name, local_id, set_id, set_name, set_serie_id, set_official, set_total, set_printed_code, has_image, image_base_url`). **`src/catalog/catalogRepository.js`**: camada única entre a UI/scanner e o armazenamento (ligada de verdade em `app/index.jsx` e `app/screens/HomeScreen.jsx`), com filtro física/digital/não-confirmada. Lógica pura extraída e testada sem depender de Expo: `catalogSyncDecision.js` (quando baixar de novo), `catalogInstallDecision.js` (quando instalar: checksum + integridade), `catalogRowMapping.js` (mapeamento de linha), `physicalClassification.js` (física/digital/não-confirmada) — mais testes de integração reais contra SQLite de verdade para `catalogIndex.js` e `catalogRepository.js` (`npm run test:catalog-sync`, `test:catalog-install-decision`, `test:catalog-row-mapping`, `test:physical-classification`, `test:catalog-index-query`, `test:catalog-repository`).

## Entrega 2: persistência pessoal (fichários, checklist, inventário)

### Onde os dados ficam

Os dados pessoais (fichários, cópias físicas, associações de espécie) vivem num banco **separado** do catálogo público: `dexbinder_user.db`, no mesmo diretório padrão do expo-sqlite (`defaultDatabaseDirectory`, ex.: `/data/user/0/<pacote>/files/SQLite` no Android). O catálogo público (`dexbinder_catalog.db`, somente leitura, substituído inteiro a cada sincronização) nunca é tocado pelas tabelas pessoais.

**Esta versão não sincroniza entre dispositivos nem exige conta/e-mail** — os dados ficam só neste aparelho (aviso também visível na aba Início). Login/Supabase/nuvem são explicitamente fora do escopo desta entrega (ver `reports/delivery-2.md`, seção de limitações).

### Migrações

`src/storage/userMigrations.js` guarda um array de migrações versionadas (`schema_migrations`, uma linha por versão aplicada). `src/storage/userDb.js` abre o banco e roda as migrações pendentes automaticamente na primeira chamada de qualquer repositório — reabrir o app não duplica nem perde dados (testado: `npm run test:user-migrations`). Rodar uma migração nova só exige adicionar um item ao array `MIGRATIONS`, nunca editar uma já publicada.

### Camadas (nenhuma tela fala SQL diretamente)

- **Identidade de carta** (`src/domain/catalogCardKey.js`): `catalog_card_key` é gerada a partir de provider+idioma+ID da carta+ID do set+`localId`, com serialização escapada (nunca concatenação ingênua) — nunca usa `variantId` do TCGdex nem só `source_card_id` (ver achados reais documentados em `reports/catalog-audit.md`/`reports/delivery-1.md`).
- **Domínio puro e testável** (`src/domain/`): `gridLayout.js` (grade/posição), `progressCalculations.js` (progresso de fichário/inventário/Pokédex global — nunca duplicado nas telas), `checklistGeneration.js` (geração/regeneração de itens), `expansionEligibility.js` (decide se um set×idioma já está sincronizado o bastante pra checklist automática completa), `collectionValidation.js`, `speciesSuggestion.js` (sugestão de espécie por nome — nunca confirma sozinha).
- **Repositórios** (`src/collections/`): `CollectionRepository`, `ChecklistRepository`, `PhysicalCopyRepository`, `CardSpeciesRepository` e `CollectionProgressService` (orquestra os quatro + os cálculos puros). Instâncias únicas exportadas em `src/collections/index.js`, mesmo padrão de `catalogRepository`.
- **Telas**: `app/screens/FichariosScreen.jsx` (lista real), `app/screens/CollectionWizard.jsx` (assistente de criação), `app/screens/CollectionDetailScreen.jsx` (checklist + cópias/posições), `app/components/AddCopyModal.jsx` (fluxo único de "adicionar cópia", compartilhado entre Inventário, detalhe de fichário e Garimpo), `app/screens/InventarioScreen.jsx` e `app/screens/PokedexScreen.jsx` atualizados com dados reais, `app/screens/HomeScreen.jsx` com contadores reais, e `app/index.jsx` (Garimpo) com o botão **"Já comprei — registrar no inventário"** e a consulta ao estado real da coleção ao confirmar um candidato.

### Regra física central

Uma impressão (carta específica de um set+número+idioma) pode estar em vários fichários — mas cada **cópia física** é um registro próprio, com no máximo um fichário e um bolso por vez (garantido por índices únicos parciais reais no SQLite, não só por convenção de código — ver `src/storage/userMigrations.js`). Transferir uma cópia muda sua localização; nunca cria ou apaga um registro.

### UUID

`expo-crypto` (instalado nesta entrega, `npx expo install expo-crypto`) fornece `Crypto.randomUUID()` real para todo ID pessoal (`src/domain/generateId.js`). Achado real verificando o build (`npx expo export`): um fallback para `require("crypto")` (módulo nativo do Node) QUEBRA o bundle de verdade — o Metro resolve `require()` estaticamente, mesmo dentro de um try/catch nunca alcançado em produção — por isso o fallback usado nos testes em Node é 100% JavaScript puro (sem nenhum módulo nativo).

### Troubleshooting (Entrega 2)

- **"Fichário não aparece depois de criado"**: a lista (`FichariosScreen`) só recarrega ao entrar na tela — volte para "Fichários" na navegação inferior.
- **"Bolso já ocupado" ao mover uma cópia**: é o índice único parcial fazendo seu trabalho — escolha outro bolso ou mova a cópia ocupante primeiro.
- **Checklist de expansão bloqueada no assistente**: o set×idioma escolhido ainda não tem todas as impressões sincronizadas localmente (`sync-catalog.yml` roda de hora em hora); aguarde ou crie um fichário Personalizado enquanto isso.
- **Nova dependência nativa (`expo-crypto`)**: como `@expo/vector-icons` na Entrega 1, pode não exigir um APK de dev-client novo (é JS-only por cima de um módulo nativo simples do próprio Expo), mas se o app não conseguir gerar IDs num build de dev-client antigo, gere um novo via `build-android-dev.yml`.

## Estrutura

```text
App.js                           # entrada do Expo: renderiza app/Navigation.jsx
app/Navigation.jsx                # navegação de 5 abas (Início/Fichários/Pokédex/Garimpo/Inventário), à mão (sem expo-router)
app/theme.js                      # paleta de cores compartilhada entre as telas
app/components/AppButton.jsx      # botão compartilhado
app/components/CatalogStatusBanner.jsx  # estado da sincronização do catálogo (usado na Home e no Garimpo)
app/components/ScreenHeader.jsx    # cabeçalho padrão de topo de aba (Entrega 1)
app/components/AddCopyModal.jsx    # (Entrega 2) fluxo único de "adicionar cópia física", usado por Inventário/detalhe de fichário/Garimpo
app/screens/HomeScreen.jsx        # Início: estado/versão do catálogo + contadores reais de fichários/inventário/Pokédex (Entrega 2)
app/screens/FichariosScreen.jsx   # (Entrega 2) lista real de fichários, progresso, arquivar/restaurar/excluir
app/screens/CollectionWizard.jsx  # (Entrega 2) assistente de criação de fichário (tipo -> origem/escopo -> grade -> prévia)
app/screens/CollectionDetailScreen.jsx  # (Entrega 2) detalhe do fichário: checklist + cópias/posições
app/screens/PokedexScreen.jsx     # lista as 1025 espécies reais do cadastro mestre + progresso/associação real (Entrega 2)
app/screens/InventarioScreen.jsx  # (Entrega 2) totais reais, filtro por fichário/"Sem fichário", mover/remover cópia
app/index.jsx                    # aba Garimpo: permissão → captura → prévia/refazer → OCR → candidatos (catálogo completo) → confirmação manual → consulta ao inventário real + "Já comprei" (Entrega 2) → busca manual
app/assets/catalog-index.json    # bundle estático de 58 cartas da Entrega 0 — histórico, não usado mais pelo app real
app/assets/data/national-dex.json # cadastro mestre da Pokédex Nacional (1025 espécies, PokeAPI), gerado por scripts/build-national-dex.js
android/                        # gerado por `expo prebuild` nesta sessão (config real, não hipotética)
src/catalog/tcgdexClient.js      # adaptador HTTP isolado para a API TCGdex v2
src/catalog/catalogFixtures.js   # loader (Node) das fixtures reais + resolução do mapa set->série
src/catalog/catalogRepository.js # camada única entre UI/scanner e armazenamento do catálogo (Entrega 1)
src/data/nationalDexValidation.js # validação do cadastro mestre (contagem, unicidade, lacunas, checksum)
src/scanner/cameraCapture.js     # captura de foto estática (expo-camera)
src/scanner/rotateImage.js       # rotação manual da foto (botão "girar") — correção automática por EXIF não confiável nesta forma de uso, ver decision.md 3.12
src/scanner/cropImage.js         # recortes (expo-image-manipulator, API nova "manipulate()")
src/scanner/ocrAdapter.js        # isola rn-mlkit-ocr / @react-native-ml-kit/text-recognition
src/scanner/parseCardText.js     # normalização (acentos/caixa/pontuação) e extração de nome+número
src/scanner/rankCandidates.js    # pontuação heurística de candidatos (função pura, testada) — sem alteração na Entrega 1
src/scanner/naturalSort.js       # ordenação natural de localId (nunca converte para inteiro)
src/scanner/resolveImageUrl.js   # resolve URL de imagem só quando há base real
src/storage/catalogSync.js       # baixa/valida (checksum+integridade)/instala o catálogo completo com segurança
src/storage/catalogSyncDecision.js    # lógica pura: quando baixar de novo (checksum, não data)
src/storage/catalogInstallDecision.js # lógica pura: quando instalar (checksum OK + integridade SQLite OK)
src/storage/catalogIndex.js      # consultas SQL sobre o catálogo completo instalado (schema real)
src/storage/catalogRowMapping.js # lógica pura: mapeia linha do banco -> registro usado por rankCandidates()
src/storage/physicalClassification.js  # física / digital / não-confirmada (nunca silenciosa)
src/storage/userDb.js            # (Entrega 2) abre o banco pessoal (dexbinder_user.db) e roda as migrações
src/storage/userMigrations.js    # (Entrega 2) schema versionado do banco pessoal (fichários/checklist/cópias/espécies)
src/storage/userRowMapping.js    # (Entrega 2) mapeia linhas cruas das tabelas pessoais para objetos camelCase
src/domain/generateId.js         # (Entrega 2) UUID real (expo-crypto) com fallback 100% JS para os testes em Node
src/domain/catalogCardKey.js     # (Entrega 2) identidade estável de impressão (nunca variantId nem só source_card_id)
src/domain/collectionValidation.js # (Entrega 2) validação pura de nome/grade ao criar/editar fichário
src/domain/gridLayout.js         # (Entrega 2) modelos de grade, posição de slot, prévia de impacto ao redimensionar
src/domain/checklistGeneration.js # (Entrega 2) geração/regeneração de itens de checklist (espécie e impressão)
src/domain/expansionEligibility.js # (Entrega 2) decide se um set×idioma já está sincronizado o bastante pra checklist automática
src/domain/progressCalculations.js # (Entrega 2) progresso de fichário/inventário/Pokédex global — centralizado, nunca duplicado na UI
src/domain/speciesSuggestion.js  # (Entrega 2) sugestão (nunca confirmação automática) de espécie por nome da carta
src/collections/collectionRepository.js   # (Entrega 2) CRUD de fichários
src/collections/checklistRepository.js    # (Entrega 2) itens de checklist (gerar/adicionar/remover/reordenar/regenerar)
src/collections/physicalCopyRepository.js # (Entrega 2) cópias físicas (adicionar/mover/trocar/transferir/remover)
src/collections/cardSpeciesRepository.js  # (Entrega 2) associação carta->espécie (confirmed/suggested)
src/collections/collectionProgressService.js # (Entrega 2) orquestra os repositórios acima + estado real pro Garimpo
src/collections/index.js         # (Entrega 2) instâncias únicas dos repositórios, mesmo padrão de catalogRepository
scripts/build-national-dex.js    # busca as 1025 espécies reais da PokeAPI, gera app/assets/data/national-dex.json
scripts/run-catalog-audit.js     # roda a auditoria real do catálogo (ver reports/catalog-audit.md)
scripts/build-series-map.js      # consulta real a /series e /series/{id}; gera o mapa set->série
scripts/export-index-bundle.js   # gera app/assets/catalog-index.json (fixtures + filtro tcgp) — só para esta PoC
scripts/add-more-151-cards.js    # busca mais fixtures reais do set "151" (sv03.5), pra ampliar o bundle de teste
scripts/sync-full-catalog.js     # gera/atualiza o banco SQLite do catálogo completo (todos os sets/idiomas), retomável em lotes
scripts/build-thumbnails.js      # gera miniaturas pequenas pré-empacotadas a partir do banco acima (amostra manual, arquivos soltos)
scripts/sync-thumbnails.js       # versão resumível/automatizável do mesmo processo (BLOBs num único banco), usada pelo workflow
scripts/run-matching-tests.js    # 36 testes automatizados reais (node:test), incluindo regressões com OCR real
scripts/run-catalog-sync-tests.js # 4 testes reais da lógica de decisão de sincronização (src/storage/catalogSyncDecision.js)
scripts/run-physical-classification-tests.js  # 5 testes (física/digital/não-confirmada, inclui o caso B2-001 da especificação)
scripts/run-catalog-install-decision-tests.js # 6 testes (checksum incorreto/incompleto, SQLite inválido, caso OK)
scripts/run-catalog-row-mapping-tests.js      # 6 testes (mapeamento de linha real do catalog.db publicado)
scripts/run-catalog-index-query-tests.js      # 13 testes de integração reais (SQLite de verdade) das consultas do catálogo
scripts/run-catalog-repository-tests.js       # 10 testes de integração reais do CatalogRepository (física/digital/scanner)
scripts/run-national-dex-tests.js             # 10 testes reais contra o cadastro mestre de 1025 espécies gerado de verdade
scripts/run-catalog-card-key-tests.js         # (Entrega 2) 10 testes de identidade de impressão (sem colisão, mesmo com delimitador nos dados)
scripts/run-user-migrations-tests.js          # (Entrega 2) 7 testes do schema pessoal contra SQLite de verdade (constraints reais, idempotência)
scripts/run-grid-layout-tests.js              # (Entrega 2) 8 testes de grade/posição/prévia de redimensionamento
scripts/run-progress-calculations-tests.js    # (Entrega 2) 15 testes de progresso de fichário/inventário/Pokédex global
scripts/run-checklist-generation-tests.js     # (Entrega 2) 14 testes de geração/regeneração de checklist
scripts/run-collection-repository-tests.js    # (Entrega 2) 9 testes reais do CollectionRepository (CRUD, exclusão segura)
scripts/run-checklist-repository-tests.js     # (Entrega 2) 10 testes reais do ChecklistRepository (gerar/regenerar/matching)
scripts/run-physical-copy-repository-tests.js # (Entrega 2) 10 testes reais do PhysicalCopyRepository (mover/trocar/transferir)
scripts/run-card-species-repository-tests.js  # (Entrega 2) 7 testes reais do CardSpeciesRepository (confirmed/suggested)
scripts/run-collection-progress-service-tests.js # (Entrega 2) 6 testes de integração ponta a ponta (Garimpo->inventário->checklist->Pokédex)
scripts/run-expansion-eligibility-tests.js    # (Entrega 2) 5 testes de elegibilidade de set×idioma pra checklist automática
scripts/testHelpers/sqliteTestAdapter.js      # (Entrega 2) adaptador reutilizável better-sqlite3 -> interface async do expo-sqlite
scripts/testHelpers/userTestDb.js             # (Entrega 2) banco de teste em memória já migrado, usado pelos testes de repositório
scripts/maybe-slow-down-cron.js  # reduz sozinho o cron do sync-catalog.yml quando o catálogo completa (chamado pelo próprio workflow)
scripts/run-cron-switch-tests.js # 4 testes reais da lógica acima (src/automation/cronSwitch.js)
scripts/check-jsx-syntax.js      # valida sintaxe JSX real com @babel/parser
fixtures/cards/*.json            # 59 respostas REAIS da API TCGdex (31 da auditoria original + 28 do set 151, ver scripts/add-more-151-cards.js)
fixtures/catalog/set-series-map.json  # mapa real set->série (220 sets, 21 séries)
reports/catalog-audit.md         # relatório da PoC A (catálogo) — achados reais, com evidência
reports/decision.md              # relatório final — PoC A + PoC B, GO/GO COM LIMITAÇÕES/NÃO EXECUTADO
reports/ocr-test-results.csv     # 3 linhas informais reais (ver decision.md 3.12) + template do dataset formal, ainda pendente (seção 16.3)
.github/workflows/build-android.yml      # APK standalone (release), build automático a cada push
.github/workflows/build-android-dev.yml  # APK de dev-client (debug), manual — só quando dependência nativa muda
.github/workflows/sync-catalog.yml       # sincronização automática do catálogo completo, de hora em hora, ver seção acima
.github/workflows/sync-thumbnails.yml    # sincronização automática das miniaturas (só ativa depois que o catálogo completar)
.github/workflows/test.yml               # roda npm test a cada push/PR em master
```

## Versões (verificadas no registro npm/Expo em 22/10/2026, não copiadas de tutorial)

- `expo@58.0.17`, `react@19.3.0`, `react-native@0.88.0` — confirmados por `npx expo install --fix` real, depois que `expo-doctor` apontou que os valores anteriores (`react@19.1.0`/`react-native@0.82.0`, herdados sem verificação) estavam desatualizados.
- `expo-camera@58.0.12`, `expo-image-manipulator@58.0.15`, `expo-sqlite@58.0.13`, `expo-dev-client@~58.0.14` — versões reais da família SDK 58.
- `rn-mlkit-ocr@0.3.1` — candidato primário de OCR (ver `reports/decision.md`, seção 5, para a comparação com a alternativa e as ressalvas sobre New Architecture).
- `@expo/vector-icons@^15.0.2` — ícones da interface (Feather/MaterialCommunityIcons); usa `expo-font`, já incluído como dependência transitiva do pacote `expo` e autolinkado — não exigiu gerar um APK novo.
- `expo-crypto@58.0.7` (Entrega 2) — `Crypto.randomUUID()` real para IDs pessoais; instalado via `npx expo install expo-crypto` (versão confirmada compatível com o SDK 58 pela própria Expo).

## Importante

- A Entrega 0 foi um protótipo de validação técnica descartável; a Entrega 1 é a primeira base real do app (preserva o código validado da Entrega 0, não o reimplementa do zero); a Entrega 2 liga Fichários/Pokédex/Inventário a persistência local real, sem reimplementar nada da Entrega 1.
- Nenhuma credencial foi usada (TCGdex e PokeAPI são públicas, sem autenticação; a Release `catalog-data` deste repositório também é pública, sem token embutido no app).
- O scanner (aba Garimpo) identifica, consulta o estado real da coleção e, só com confirmação explícita do usuário ("Já comprei — registrar no inventário"), grava uma cópia física — nunca por uma simples identificação (Entrega 2, seção 8.9).
- Direitos de imagem/marca Pokémon **não foram avaliados** (ver seção 15 da especificação original) — continuam bloqueando qualquer publicação comercial. Mesma ressalva vale para os dados da PokeAPI (Pokédex Nacional): fonte comunitária, sem licença comercial formal.
- A PokeAPI não tem nomes de espécie em português — achado real, documentado em `app/assets/data/national-dex.json` e `reports/delivery-1.md`. A interface da Pokédex continua mostrando o nome disponível (inglês), nunca uma tradução inventada.
- Persistência pessoal é só local nesta versão — sem login, conta ou sincronização entre dispositivos (ver seção "Entrega 2" acima e `reports/delivery-2.md` para o detalhamento completo de limitações).
