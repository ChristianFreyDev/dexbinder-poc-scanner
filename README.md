# poc-catalog-scanner — Entrega 0 do DexBinder

Protótipo **isolado e descartável** (não é o aplicativo final) criado para responder, com evidência real, às duas perguntas da Entrega 0 da especificação:

1. O catálogo TCGdex serve como base confiável para checklists/impressões/variantes/idiomas?
2. Uma foto de carta + OCR no dispositivo permite gerar candidatos úteis, mantendo confirmação manual?

**Leia primeiro:** [`reports/decision.md`](reports/decision.md) — relatório final GO / GO COM LIMITAÇÕES / NO-GO, com o que foi executado de verdade (incluindo `expo-doctor`, `expo prebuild`, resolução de autolinking, e testes reais em Android físico com cartas físicas — seção 3.12) e o que ainda falta (dataset formal de 60 fotos, seção 16.3 da especificação).

## O que roda agora, sem nenhum dispositivo Android

```bash
npm install

# Reexecuta a auditoria real do catálogo TCGdex (consultas HTTP reais, não mocks)
npm run audit:catalog

# Reconstrói o mapa real set->série (consulta a API TCGdex de verdade) — necessário
# para o filtro de séries digitais (TCG Pocket) funcionar
npm run build:series-map

# Gera o bundle único do índice local (app/assets/catalog-index.json) a partir das
# fixtures + do mapa de séries, já com o TCG Pocket filtrado
npm run build:index-bundle

# Roda os 36 testes automatizados da lógica de reconhecimento/ranking/filtro,
# incluindo testes de regressão com texto OCR real transcrito de fotos físicas
npm run test:matching

# Verifica a sintaxe JSX/JS real do app (sem precisar instalar o React Native inteiro)
npm run check:jsx

# Os dois acima juntos:
npm test
```

Nenhum desses comandos precisa de Android SDK, JDK, emulador ou câmera.

## Verificações de config/build que não precisam de Android físico

```bash
npx expo-doctor          # 19/20 checks reais passando (1 flag real sobre New Architecture — ver decision.md)
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

## Catálogo completo (base da Entrega 1, rodando automaticamente)

Além do bundle estático de 30 cartas desta PoC, já existe a base real da arquitetura de catálogo completo (ver `reports/decision.md`, seções 11/11.1/11.2): um workflow (`.github/workflows/sync-catalog.yml`) roda de hora em hora, buscando um lote do catálogo completo (todos os sets, todos os idiomas) direto da API do TCGdex, retomando de onde parou a cada execução, e publicando o progresso como assets da Release `catalog-data` deste repositório. Scripts por trás disso:

```bash
# Gera/atualiza o banco SQLite do catálogo completo (dist/catalog/catalog.db)
npm run sync:full-catalog -- --full --resume --batch=25

# Gera miniaturas pequenas pré-empacotadas (dist/catalog/thumbnails/), a partir do banco acima
node scripts/build-thumbnails.js --limit=20   # amostra; use --full para todas (download pesado, combinar antes)
```

Ambos têm modo de amostra pequena por padrão (sem `--full`) — seguros de rodar localmente para testar sem varrer o catálogo inteiro.

**Repositório público**: tornado público em 23/10/2026 (ver `reports/decision.md`, seção 11.3) porque o app precisa baixar os assets da Release `catalog-data` sem autenticação — um app publicado não pode ter um token do GitHub embutido só pra isso. Histórico conferido antes: nenhum segredo encontrado.

**`src/storage/catalogSync.js`** (novo, não conectado ainda à tela do scanner): implementa o lado do app que baixa e instala o banco publicado (`checkForUpdate()`, `downloadAndInstallCatalog()`, `syncCatalogIfNeeded()`, `openSyncedCatalogDb()`), usando `expo-file-system` + `expo-sqlite`. Completa, junto com `src/storage/catalogIndex.js`, a arquitetura descrita na seção 11 de `reports/decision.md` — ligar isso à tela real é decisão de Entrega 1. A regra de "quando baixar de novo" (comparar checksum, não data) foi extraída para `src/storage/catalogSyncDecision.js`, sem dependência de Expo, e tem 4 testes automatizados reais (`npm run test:catalog-sync`).

## Estrutura

```text
app/index.jsx                   # tela única: permissão → captura → prévia/refazer → OCR → candidatos → confirmação manual → busca manual
app/assets/catalog-index.json   # bundle único do índice local (gerado por scripts/export-index-bundle.js)
App.js                          # entrada do Expo, só monta a tela acima
android/                        # gerado por `expo prebuild` nesta sessão (config real, não hipotética)
src/catalog/tcgdexClient.js      # adaptador HTTP isolado para a API TCGdex v2
src/catalog/catalogFixtures.js   # loader (Node) das fixtures reais + resolução do mapa set->série
src/scanner/cameraCapture.js     # captura de foto estática (expo-camera)
src/scanner/rotateImage.js       # rotação manual da foto (botão "girar") — correção automática por EXIF não confiável nesta forma de uso, ver decision.md 3.12
src/scanner/cropImage.js         # recortes (expo-image-manipulator, API nova "manipulate()")
src/scanner/ocrAdapter.js        # isola rn-mlkit-ocr / @react-native-ml-kit/text-recognition
src/scanner/parseCardText.js     # normalização (acentos/caixa/pontuação) e extração de nome+número
src/scanner/rankCandidates.js    # pontuação heurística de candidatos (função pura, testada)
src/scanner/naturalSort.js       # ordenação natural de localId (nunca converte para inteiro)
src/scanner/resolveImageUrl.js   # resolve URL de imagem só quando há base real
src/storage/catalogIndex.js      # índice local em SQLite (expo-sqlite) — base da leitura local da Entrega 1, ver decision.md seção 11
scripts/run-catalog-audit.js     # roda a auditoria real do catálogo (ver reports/catalog-audit.md)
scripts/build-series-map.js      # consulta real a /series e /series/{id}; gera o mapa set->série
scripts/export-index-bundle.js   # gera app/assets/catalog-index.json (fixtures + filtro tcgp) — só para esta PoC
scripts/sync-full-catalog.js     # gera/atualiza o banco SQLite do catálogo completo (todos os sets/idiomas), retomável em lotes
scripts/build-thumbnails.js      # gera miniaturas pequenas pré-empacotadas a partir do banco acima
scripts/run-matching-tests.js    # 36 testes automatizados reais (node:test), incluindo regressões com OCR real
scripts/run-catalog-sync-tests.js # 4 testes reais da lógica de decisão de sincronização (src/storage/catalogSyncDecision.js)
scripts/check-jsx-syntax.js      # valida sintaxe JSX real com @babel/parser
fixtures/cards/*.json            # 31 respostas REAIS da API TCGdex, salvas pela auditoria
fixtures/catalog/set-series-map.json  # mapa real set->série (220 sets, 21 séries)
reports/catalog-audit.md         # relatório da PoC A (catálogo) — achados reais, com evidência
reports/decision.md              # relatório final — PoC A + PoC B, GO/GO COM LIMITAÇÕES/NÃO EXECUTADO
reports/ocr-test-results.csv     # 3 linhas informais reais (ver decision.md 3.12) + template do dataset formal, ainda pendente (seção 16.3)
.github/workflows/build-android.yml      # APK standalone (release), build automático a cada push
.github/workflows/build-android-dev.yml  # APK de dev-client (debug), manual — só quando dependência nativa muda
.github/workflows/sync-catalog.yml       # sincronização automática do catálogo completo, de hora em hora, ver seção acima
```

## Versões (verificadas no registro npm/Expo em 22/10/2026, não copiadas de tutorial)

- `expo@58.0.17`, `react@19.3.0`, `react-native@0.88.0` — confirmados por `npx expo install --fix` real, depois que `expo-doctor` apontou que os valores anteriores (`react@19.1.0`/`react-native@0.82.0`, herdados sem verificação) estavam desatualizados.
- `expo-camera@58.0.12`, `expo-image-manipulator@58.0.15`, `expo-sqlite@58.0.13`, `expo-dev-client@~58.0.14` — versões reais da família SDK 58.
- `rn-mlkit-ocr@0.3.1` — candidato primário de OCR (ver `reports/decision.md`, seção 5, para a comparação com a alternativa e as ressalvas sobre New Architecture).
- `@expo/vector-icons@^15.0.2` — ícones da interface (Feather/MaterialCommunityIcons); usa `expo-font`, já incluído como dependência transitiva do pacote `expo` e autolinkado — não exigiu gerar um APK novo.

## Importante

- Isto é um protótipo de validação técnica, não a base de código do app final. Nada aqui deve ser copiado para o projeto principal sem revisão (Entrega 1 em diante).
- Nenhuma credencial foi usada (a API pública do TCGdex não exige autenticação). Nenhuma fixture contém dados sensíveis.
- O protótipo não grava nada em inventário/checklist — a "confirmação" na tela serve só para avaliar a PoC.
- Direitos de imagem/marca Pokémon **não foram avaliados** nesta PoC (ver seção 15 da especificação) — continuam bloqueando qualquer publicação comercial.
