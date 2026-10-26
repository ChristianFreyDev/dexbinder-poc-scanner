# DexBinder — Entrega 2: Relatório de entrega

**Data:** 26/10/2026
**Branch/commit inicial (baseline):** `master` @ `a3ee9f9c9733b78af0828c727e8da064f7fcc562`
**Commits desta entrega:** `3e0d00c` → `c6abd3d` (9 commits, ver seção 6)

---

## 1. Baseline (antes de alterar qualquer código)

- **Branch:** `master`. **Commit inicial:** `a3ee9f9` ("Expansão/coleção ocupa a largura total do card, igual os motivos"). Working tree limpo.
- **`npm test` antes de qualquer mudança:** 125/125 testes (`node:test`) + `check:jsx` OK (soma: 36 matching + 4 catalog-sync + 3 catalog-sync-failure-simulation + 4 cron-switch + 5 physical-classification + 6 catalog-install-decision + 6 catalog-row-mapping + 13 catalog-index-query + 10 catalog-repository + 10 national-dex + 2 path-utils + 6 scanner-candidate-search + 7 candidate-ordering + 9 parse-manual-query — bate exatamente com o relatório da Entrega 1).
- **Fontes de verdade lidas:** `README.md`, `reports/decision.md`, `reports/delivery-1.md`, `reports/catalog-audit.md`, `reports/ocr-test-results.csv` — todos existem e foram lidos. `especificacao_app_dexbinder.md` e `especificacao_entrega_1_dexbinder.md` **não existem** no repositório — ausência registrada, seguido com as fontes disponíveis (a própria especificação da Entrega 2 permite isso explicitamente).
- **Telas/módulos existentes inspecionados antes de qualquer alteração:** `app/screens/{HomeScreen,FichariosScreen,PokedexScreen,InventarioScreen}.jsx` (todos estados vazios honestos — CRUD fora do escopo da Entrega 1, confirmado lendo o código, não suposto), `app/Navigation.jsx`, `app/theme.js`, `app/index.jsx` (Garimpo, 890 linhas), `src/storage/catalogIndex.js` + `src/catalog/catalogRepository.js` (schema real confirmado: `card_index(source_card_id, source_language, name, local_id, set_id, set_name, set_serie_id, set_official, set_total, set_printed_code, has_image, image_base_url)` — **sem** `category`/`rarity`/`dex_ids`, confirmando o achado já documentado na Entrega 1), `src/scanner/parseManualQuery.js`, `src/storage/physicalClassification.js`.
- **Estado real do manifesto publicado do catálogo (checado nesta sessão, 26/10/2026 ~10h58 UTC):** `syncedPairs: 320/1100`, `notFoundPairs: 285`, `remainingPairs: 495`, `complete: false`, `totalRecords: 24404`. Cron (`sync-catalog.yml`) confirmado saudável (últimas 6 execuções agendadas, todas `success`). Catálogo segue **parcial** — relevante porque a elegibilidade de checklist automática de expansão (seção 4 abaixo) depende de quais sets×idiomas já sincronizaram por inteiro.
- **expo-sqlite 58.0.13 confirmado** com API assíncrona completa (`execAsync`/`runAsync`/`getAllAsync`/`getFirstAsync`/`withTransactionAsync`/`withExclusiveTransactionAsync` — ver `node_modules/expo-sqlite/build/SQLiteDatabase.d.ts`), permitindo seguir o mesmo padrão de repositório testável em Node (adaptador sobre `better-sqlite3`) já usado em `catalogIndex`/`catalogRepository` na Entrega 1.
- **UUID:** nenhuma solução existia no projeto (nada com "crypto" em `node_modules`). Instalado `expo-crypto@58.0.7` (`npx expo install expo-crypto`, compatibilidade com SDK 58 confirmada pela própria Expo).

## 2. Arquitetura implementada

### 2.1. Persistência (banco pessoal separado do catálogo)

- `src/storage/userDb.js` abre `dexbinder_user.db` (arquivo **separado** de `dexbinder_catalog.db`) e aplica migrações automaticamente, conexão cacheada por processo.
- `src/storage/userMigrations.js`: migrações versionadas (`schema_migrations`), rodando em transação, idempotentes. Duas versões nesta entrega:
  - **v1** — tabelas `user_collections`, `checklist_items`, `owned_card_copies`, `card_species_links` + índices únicos parciais reais que impedem (a) duas cópias ativas no mesmo bolso do mesmo fichário e (b) item de checklist duplicado ativo (espécie ou impressão de idioma específico).
  - **v2** — índice único parcial adicional para itens de checklist com `language_policy: any_supported` (identidade por `target_set_snapshot`+`target_number_snapshot` em vez de `catalog_card_key`, que fica `NULL` nesse caso).
- `src/storage/userRowMapping.js`: snake_case (DB) -> camelCase (domínio), mesma convenção de `catalogRowMapping.js` da Entrega 1.

### 2.2. Identidade estável de impressão

`src/domain/catalogCardKey.js`: `catalog_card_key` gerada a partir de provider+idioma+ID da carta+ID do set+`localId`, com **serialização escapada** (nunca concatenação ingênua com delimitador) — garantidamente livre de colisão mesmo quando componentes reais contêm o próprio delimitador (testado). Nunca usa `variantId` do TCGdex (confirmado não confiável na Entrega 0/1) nem só `source_card_id`.

### 2.3. Domínio puro (sem SQL, 100% testável em Node)

| Módulo | Responsabilidade |
|---|---|
| `src/domain/gridLayout.js` | Modelos 1×1/2×2/3×3/4×3/5×4 + grade personalizada (1–10), posição de slot, prévia de impacto ao diminuir a grade |
| `src/domain/progressCalculations.js` | Progresso de fichário, totais de inventário, progresso da Pokédex global — **centralizado**, nunca duplicado nas telas |
| `src/domain/checklistGeneration.js` | Geração de itens (espécie ordenada por número nacional; impressão com ordenação natural, escopo `official`/`complete_catalog`, política `specific`/`any_supported`), detecção de duplicata, prévia de regeneração (nunca some com item manual nem reinstala exclusão deliberada) |
| `src/domain/expansionEligibility.js` | Decide se um set×idioma já está sincronizado o bastante para gerar checklist automática completa, comparando contra `set_official`/`set_total` reais |
| `src/domain/collectionValidation.js` | Validação de nome/grade ao criar fichário |
| `src/domain/speciesSuggestion.js` | Sugestão (nunca confirmação automática) de espécie por nome da carta |

### 2.4. Repositórios (`src/collections/`) — nenhuma tela fala SQL diretamente

`CollectionRepository`, `ChecklistRepository`, `PhysicalCopyRepository`, `CardSpeciesRepository` + `CollectionProgressService` (orquestra os quatro acima com os cálculos puros da seção 2.3). Operações multi-linha (criar N cópias, regenerar checklist, excluir fichário com segurança) usam `db.withTransactionAsync`. Instâncias únicas exportadas em `src/collections/index.js`, mesmo padrão de `catalogRepository` da Entrega 1.

### 2.5. Telas ligadas a dados reais

`FichariosScreen` (lista + arquivar/restaurar/excluir com confirmação) + `CollectionWizard` (assistente de criação em passos) + `CollectionDetailScreen` (checklist com busca/filtro + cópias/posições) + `AddCopyModal` (fluxo único de "adicionar cópia", compartilhado entre Inventário/detalhe de fichário/Garimpo) + `InventarioScreen`/`PokedexScreen`/`HomeScreen` atualizados com dados reais + `app/index.jsx` (Garimpo) com consulta ao estado real da coleção e o botão "Já comprei — registrar no inventário".

## 3. Achado real crítico (bug de build, não de lógica)

Rodando `npx expo export --platform android` (verificação de build que não exige dispositivo físico — mesmo espírito do `expo prebuild`/`expo-doctor` já usados na Entrega 1) **antes** de considerar a entrega pronta: o fallback de `generateId.js` para `require("crypto")` (módulo nativo do Node, usado só nos testes) **quebrava o bundle de verdade** — `Error: Unable to resolve module crypto`. O Metro resolve `require()` estaticamente ao montar o grafo de dependências, antes de qualquer execução, então o `require("crypto")` dentro de um `catch` nunca alcançado em produção ainda assim derrubava o build inteiro. Isso é diferente de `expo-file-system`/`expo-sqlite` (pacotes reais presentes em `node_modules`, resolvidos normalmente pelo Metro, só falhando em tempo de EXECUÇÃO fora do runtime React Native).

**Corrigido** com um gerador de UUID v4 100% JavaScript (`Math.random`, sem nenhum módulo nativo) como fallback — usado só nos testes em Node; o app no celular sempre usa `Crypto.randomUUID()` real do `expo-crypto`. Confirmado: `npx expo export --platform android` builda com sucesso (820 módulos) depois da correção.

Este achado valida a decisão de rodar uma checagem de build real antes de declarar a entrega pronta, em vez de confiar só em `check:jsx` (que só valida sintaxe, não resolução de módulos).

## 4. Regras de negócio centrais — como foram garantidas

- **Uma impressão em dois fichários exige duas cópias físicas**: testado ponta a ponta (`run-physical-copy-repository-tests.js`) — cada `addCopies()` cria IDs distintos; nunca há FK ou referência compartilhada entre fichários para a "mesma" cópia.
- **Cada cópia pertence a no máximo um fichário/bolso por vez**: garantido por **índice único parcial real no SQLite** (`uq_owned_copies_slot`), não só por convenção de código — testado tentando inserir diretamente via SQL e confirmando `SQLITE_CONSTRAINT`.
- **Progresso de checklist independente por fichário, Pokédex global única por espécie**: `progressCalculations.js` recebe sempre as cópias JÁ FILTRADAS por coleção (para checklist) ou o inventário inteiro (para a Pokédex global) — testado com um cenário em que a mesma espécie tem cópias em dois fichários diferentes e cada progresso é calculado isoladamente, e com cenário de cópia sem fichário ainda contando pro progresso global.
- **Associação `suggested` nunca conta como posse confirmada**: `CardSpeciesRepository.getConfirmedLinksMap()` filtra por `association_status = 'confirmed'` na própria query SQL — testado inserindo um `suggested` manualmente e confirmando que ele não aparece no mapa.
- **Scanner nunca grava posse sozinho**: `app/index.jsx` só chama `getConfirmedCardStatus()` (leitura) ao confirmar um candidato; a única escrita possível é o botão explícito "Já comprei — registrar no inventário", que abre o mesmo `AddCopyModal` do Inventário.

## 5. Testes automatizados — comandos e saída real

```
npm test
```

| Suíte | Testes | Resultado |
|---|---|---|
| test:matching (Entrega 0/1, preservado) | 36 | 36 pass |
| test:catalog-sync (preservado) | 4 | 4 pass |
| test:catalog-sync-failure-simulation (preservado) | 3 | 3 pass |
| test:cron-switch (preservado) | 4 | 4 pass |
| test:physical-classification (preservado) | 5 | 5 pass |
| test:catalog-install-decision (preservado) | 6 | 6 pass |
| test:catalog-row-mapping (preservado) | 6 | 6 pass |
| test:catalog-index-query (preservado + 2 consultas novas) | 13 | 13 pass |
| test:catalog-repository (preservado) | 10 | 10 pass |
| test:national-dex (preservado) | 10 | 10 pass |
| test:path-utils (preservado) | 2 | 2 pass |
| test:scanner-candidate-search (preservado) | 6 | 6 pass |
| test:candidate-ordering (preservado) | 7 | 7 pass |
| test:parse-manual-query (preservado) | 9 | 9 pass |
| **test:catalog-card-key** (novo) | 10 | 10 pass |
| **test:user-migrations** (novo) | 7 | 7 pass |
| **test:grid-layout** (novo) | 8 | 8 pass |
| **test:progress-calculations** (novo) | 15 | 15 pass |
| **test:checklist-generation** (novo) | 14 | 14 pass |
| **test:collection-repository** (novo) | 9 | 9 pass |
| **test:checklist-repository** (novo) | 10 | 10 pass |
| **test:physical-copy-repository** (novo) | 10 | 10 pass |
| **test:card-species-repository** (novo) | 7 | 7 pass |
| **test:collection-progress-service** (novo) | 6 | 6 pass |
| **test:expansion-eligibility** (novo) | 5 | 5 pass |
| check:jsx | 14 arquivos | todos OK |
| **TOTAL** | **226** | **226 pass, 0 fail** |

Todos os testes de repositório/migração rodam contra **SQLite de verdade** (`better-sqlite3` em memória, adaptador reutilizável em `scripts/testHelpers/sqliteTestAdapter.js` que expõe a mesma interface assíncrona do `expo-sqlite` real), não mocks de resultado — incluindo um teste de integração ponta a ponta (`run-collection-progress-service-tests.js`) que exercita o fluxo completo Garimpo → inventário → checklist → Pokédex global num único banco.

**Verificação adicional de build real** (não substitui teste físico, mas vai além de `check:jsx`): `npx expo export --platform android` builda com sucesso (820 módulos, ver seção 3). `npx expo-doctor`: 18/20 (mesmos 2 avisos já conhecidos e documentados na Entrega 1 — config de prebuild e patch versions não atualizadas sem necessidade; `expo-crypto` não introduziu nenhum aviso novo).

## 6. Commits desta entrega

```
3e0d00c Entrega 2 (1/N): persistência local pessoal — identidade de carta e migrações
09c637d Entrega 2 (2/N): regras de domínio puras — grade, progresso e checklist
b33c06a Entrega 2 (3/N): repositórios de fichários, checklist, cópias e espécies
9a19686 Entrega 2 (4/N): elegibilidade de set x idioma para checklist automática
92fbe22 Entrega 2 (5/N): telas de Fichários, Pokédex, Inventário e Início + Garimpo
b6cddac Entrega 2: corrige build real quebrado por require("crypto") no fallback de UUID
c6abd3d Entrega 2: busca/filtro na checklist do fichário + README atualizado
```

## 7. Testes em dispositivo físico (Android real)

**NÃO EXECUTADO nesta sessão** — este ambiente de desenvolvimento não tem um dispositivo Android físico nem emulador conectado (diferente das sessões anteriores, onde o usuário testava no próprio celular via Expo Dev Client na mesma Wi-Fi). Não foi simulado nem declarado como testado — ver seção 16 da especificação ("não chamar uma simulação Node de teste físico").

O que **foi** verificado sem dispositivo (seção 3/5): sintaxe JSX de todos os arquivos novos/alterados, bundle Android real via `npx expo export` (820 módulos, pega erros de resolução de módulo que `check:jsx` não cobre), `npx expo-doctor` (18/20, nenhuma regressão), e toda a lógica de domínio/persistência contra SQLite de verdade (226 testes).

**Runbook exato para o usuário validar fisicamente** (mesmo fluxo de dev-client já usado nas entregas anteriores):

```bash
npm install
npx expo start
# abrir o app no celular (dev-client já instalado, mesma Wi-Fi do computador)
```

Como `expo-crypto` é uma dependência nativa NOVA (ao contrário de `@expo/vector-icons`, que não exigiu rebuild por já vir como transitiva), **gere um dev-client novo antes de testar**:

```bash
# via GitHub Actions (sem precisar de Android SDK local):
#   build-android-dev.yml → novo APK de dev-client (debug, conecta ao Metro)
```

Roteiro de validação (espelha a seção 12.8 da especificação):

1. Criar um fichário (qualquer tipo) e fechar/reabrir o app — confirmar que ele continua lá (persistência real).
2. Criar um fichário Personalizado, adicionar 2-3 itens manuais na aba Checklist do detalhe, conferir o progresso.
3. Pela aba Inventário ou pelo detalhe de um fichário, adicionar 2 cópias da MESMA impressão em dois fichários diferentes — conferir que o Inventário mostra 2 cópias e cada fichário conta 1 item completo independente.
4. Mover uma cópia de posição (aba Cópias do detalhe) e conferir que o total do Inventário não muda.
5. Na Pokédex, abrir uma espécie, usar "Confirmar" numa cópia candidata sugerida (ou adicionar uma cópia a um fichário Pokédex, que pede a confirmação na hora) — conferir que o progresso global da Pokédex atualiza.
6. No Garimpo, confirmar uma identificação e usar "Já comprei — registrar no inventário" — conferir que a cópia aparece no Inventário e no fichário certo, se aplicável.
7. Ativar modo avião e abrir Fichários/Inventário/Pokédex — todos devem continuar funcionando (dados pessoais nunca dependem de rede).

## 8. Limitações conhecidas e simplificações deliberadas

- **Seleção manual de espécies da Pokédex por INTERVALO numérico, não um seletor multi-escolha das 1025 espécies uma a uma.** A própria especificação permite isso explicitamente ("seleção inicial por intervalo/números, se isso puder ser entregue sem lógica frágil"). Um seletor completo fica como melhoria futura.
- **Elegibilidade de `language_policy: any_supported`** usa uma heurística segura (elegível se PELO MENOS UM idioma sincronizado do set estiver 100% completo) em vez de validar posição-a-posição across todos os idiomas — nunca superestima completude, mas pode ser mais conservadora do que o teoricamente possível.
- **Visualização de posição física é uma LISTA (página/bolso em texto editável)**, não uma grade visual arrastável. As regras de posição única já são garantidas pelo banco (índice único parcial); o que fica simplificado é só a apresentação, não a regra de negócio.
- **Associação automática ao adicionar uma cópia (`ChecklistRepository.findMatchingItem`)** só cobre o caso inequívoco (no máximo um item compatível, o que é o caso comum dado os índices únicos). Ambiguidade real (que exigiria desambiguação manual explícita, especificação seção 8.8 item 5) não tem uma tela dedicada — é um cenário raro dado o desenho do schema.
- **Sem testes automatizados de UI/E2E** (sem Detox/React Testing Library configurado nesta entrega) — a cobertura automatizada é de domínio/repositório (226 testes) + sintaxe/bundle; os fluxos de tela em si dependem da validação física da seção 7.
- **Campos opcionais de cópia física** (`condition_code`, `acquired_at`, `purchase_price`, `notes`) existem no schema e no `PhysicalCopyRepository`, mas não têm campo de edição na UI rápida do `AddCopyModal` nesta entrega — podem ser adicionados depois sem migração nova.
- **Preços/raridade/variantes de acabamento como checklist separada**: fora do escopo, conforme a própria especificação (seção 1, "fora do escopo") — campo `finish_variant` existe no schema (opcional, informativo), mas nunca determina completude automática.
- **pt-BR nos nomes de espécie**: a PokeAPI não fornece — mantido o nome em inglês disponível, sem tradução inventada (mesma limitação já documentada na Entrega 1).
- **Sincronização entre dispositivos / login**: fora do escopo desta entrega por instrução explícita da especificação; arquitetura dos repositórios já usa UUIDs e `created_at`/`updated_at` em UTC ISO-8601 para permitir adicionar isso depois sem reescrever as regras.

## 9. Arquivos alterados nesta entrega

44 arquivos, +4773/-94 linhas. Resumo por área (lista completa: `git diff --stat a3ee9f9 HEAD`):

- **Novo — domínio puro:** `src/domain/{generateId,catalogCardKey,collectionValidation,gridLayout,checklistGeneration,expansionEligibility,progressCalculations,speciesSuggestion}.js`
- **Novo — persistência:** `src/storage/{userDb,userMigrations,userRowMapping}.js`; 2 funções novas em `src/storage/catalogIndex.js` (consulta, sem alterar as existentes); 2 métodos novos em `src/catalog/catalogRepository.js` (idem)
- **Novo — repositórios:** `src/collections/{collectionRepository,checklistRepository,physicalCopyRepository,cardSpeciesRepository,collectionProgressService,index}.js`
- **Novo — telas:** `app/components/AddCopyModal.jsx`, `app/screens/{CollectionWizard,CollectionDetailScreen}.jsx`
- **Alterado — telas:** `app/screens/{FichariosScreen,HomeScreen,InventarioScreen,PokedexScreen}.jsx`, `app/index.jsx` (Garimpo, seção 8.9)
- **Novo — testes (12 arquivos, 101 testes):** `scripts/run-{catalog-card-key,user-migrations,grid-layout,progress-calculations,checklist-generation,collection-repository,checklist-repository,physical-copy-repository,card-species-repository,collection-progress-service,expansion-eligibility}-tests.js`, `scripts/testHelpers/{sqliteTestAdapter,userTestDb}.js`
- **Config:** `package.json` (12 scripts de teste novos), `scripts/check-jsx-syntax.js` (6 arquivos novos), `README.md` (seção Entrega 2 completa)

## 10. Veredito por área

| Área | Veredito | Observação |
|---|---|---|
| Persistência local (SQLite, migrações) | **GO** | 7 testes de migração contra SQLite real; constraints reais testadas, não só convenção de código |
| Identidade de impressão (`catalog_card_key`) | **GO** | Nunca `variantId`, nunca só `source_card_id`; sem colisão mesmo com delimitador nos dados |
| CRUD de fichários | **GO** | Criar/editar/arquivar/restaurar/excluir com segurança, todos testados |
| Checklists (gerar/editar/regenerar) | **GO COM LIMITAÇÕES** | Funciona ponta a ponta; seleção manual de espécies é por intervalo, não multi-seletor |
| Cópias físicas e localização | **GO** | Regra "1 fichário/bolso por vez" garantida por índice único real, não só código |
| Progresso (fichário/inventário/Pokédex global) | **GO** | Centralizado, testado inclusive com cenários de carta em outro fichário / multi-espécie |
| Integração do Garimpo | **GO** | Consulta estado real + "Já comprei" explícito; nunca grava posse só pela identificação |
| UI das telas novas | **GO COM LIMITAÇÕES** | Funcional e ligada a dados reais; posição é lista (não grade visual); sem teste automatizado de UI |
| Testes automatizados | **GO** | 226/226, incluindo integração real contra SQLite e verificação de build (`expo export`) |
| Testes em Android físico | **NÃO EXECUTADO** | Sem dispositivo/emulador neste ambiente — runbook exato na seção 7 |
| Documentação de limitações | **GO** | Seção 8 lista todas as simplificações deliberadas, nenhuma escondida |

**Veredito geral: GO COM LIMITAÇÕES.** O núcleo de domínio/persistência/regras de negócio está sólido e testado de ponta a ponta contra SQLite real; a parte pendente de maior risco é a validação visual/tátil em dispositivo físico, que não pôde ser executada neste ambiente e fica como próximo passo imediato antes de considerar a entrega definitivamente fechada.

## 11. Fora do escopo desta entrega (confirmado, não implementado)

Conforme a especificação, seção 1: login/cadastro/Supabase Auth/PostgreSQL remoto/sincronização entre dispositivos, lista de compras completa/histórico de sessões de garimpo/gastos, importação por CSV, preços de mercado/alertas/troca/venda/social, sistema comercial/pagamentos/publicação em loja, reconhecimento visual avançado por embeddings, checklist de variantes de acabamento independentes. Nada disso foi iniciado.
