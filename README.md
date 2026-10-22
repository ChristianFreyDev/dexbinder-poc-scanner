# poc-catalog-scanner — Entrega 0 do DexBinder

Protótipo **isolado e descartável** (não é o aplicativo final) criado para responder, com evidência real, às duas perguntas da Entrega 0 da especificação:

1. O catálogo TCGdex serve como base confiável para checklists/impressões/variantes/idiomas?
2. Uma foto de carta + OCR no dispositivo permite gerar candidatos úteis, mantendo confirmação manual?

**Leia primeiro:** [`reports/decision.md`](reports/decision.md) — relatório final GO / GO COM LIMITAÇÕES / NO-GO, com o que foi executado de verdade (incluindo `expo-doctor`, `expo prebuild` e resolução de autolinking reais) e o que ainda depende de um Android físico com câmera e cartas reais.

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

# Roda os 21 testes automatizados da lógica de reconhecimento/ranking/filtro,
# usando os registros reais coletados pela auditoria
npm run test:matching

# Verifica a sintaxe JSX/JS real do app (sem precisar instalar o React Native inteiro)
npm run check:jsx

# Os dois acima juntos:
npm test
```

Nenhum desses comandos precisa de Android SDK, JDK, emulador ou câmera.

## O que já foi verificado de verdade nesta sessão (mas ainda não em hardware)

```bash
npx expo-doctor          # 19/20 checks reais passando (1 flag real sobre New Architecture — ver decision.md)
npx expo prebuild --platform android --no-install   # já executado; gera android/ (config, permissões, plugin OCR aplicados)
npx react-native config  # confirma que o rn-mlkit-ocr é descoberto pelo autolinking
```

O diretório `android/` já está gerado neste repositório (saída real de `expo prebuild`) — confirme com `cat android/app/src/main/AndroidManifest.xml` que a permissão de câmera foi injetada, e com `cat android/build.gradle` que o plugin do `rn-mlkit-ocr` configurou `ocrModels`/`ocrUseBundled`.

## O que precisa de um Android físico (NÃO executado nesta sessão)

Captura de câmera, recorte de imagem e OCR real (`rn-mlkit-ocr`) exigem compilar e rodar a development build nativa — não funcionam no Expo Go. A configuração já está pronta (seção acima); falta só compilar em uma máquina com JDK + Android SDK:

```bash
npx expo run:android       # requer Android Studio/SDK configurado na máquina
```

Depois disso, siga o runbook de coleta de fotos reais na seção 7 de [`reports/decision.md`](reports/decision.md).

## Estrutura

```text
app/index.jsx                   # tela única: permissão → captura → prévia/refazer → OCR → candidatos → confirmação manual → busca manual
app/assets/catalog-index.json   # bundle único do índice local (gerado por scripts/export-index-bundle.js)
App.js                          # entrada do Expo, só monta a tela acima
android/                        # gerado por `expo prebuild` nesta sessão (config real, não hipotética)
src/catalog/tcgdexClient.js      # adaptador HTTP isolado para a API TCGdex v2
src/catalog/catalogFixtures.js   # loader (Node) das fixtures reais + resolução do mapa set->série
src/scanner/cameraCapture.js     # captura de foto estática (expo-camera)
src/scanner/cropImage.js         # recortes (expo-image-manipulator, API nova "manipulate()")
src/scanner/ocrAdapter.js        # isola rn-mlkit-ocr / @react-native-ml-kit/text-recognition
src/scanner/parseCardText.js     # normalização (acentos/caixa/pontuação) e extração de nome+número
src/scanner/rankCandidates.js    # pontuação heurística de candidatos (função pura, testada)
src/scanner/naturalSort.js       # ordenação natural de localId (nunca converte para inteiro)
src/scanner/resolveImageUrl.js   # resolve URL de imagem só quando há base real
src/storage/catalogIndex.js      # índice local em SQLite (expo-sqlite) a partir das fixtures
scripts/run-catalog-audit.js     # roda a auditoria real do catálogo (ver reports/catalog-audit.md)
scripts/build-series-map.js      # consulta real a /series e /series/{id}; gera o mapa set->série
scripts/export-index-bundle.js   # gera app/assets/catalog-index.json (fixtures + filtro tcgp)
scripts/run-matching-tests.js    # 21 testes automatizados reais (node:test)
scripts/check-jsx-syntax.js      # valida sintaxe JSX real com @babel/parser
fixtures/cards/*.json            # 31 respostas REAIS da API TCGdex, salvas pela auditoria
fixtures/catalog/set-series-map.json  # mapa real set->série (220 sets, 21 séries)
reports/catalog-audit.md         # relatório da PoC A (catálogo) — achados reais, com evidência
reports/decision.md              # relatório final — PoC A + PoC B, GO/GO COM LIMITAÇÕES/NÃO EXECUTADO
reports/ocr-test-results.csv     # TEMPLATE vazio — preencher com fotos reais (ver decision.md, seção 7)
```

## Versões (verificadas no registro npm/Expo em 22/10/2026, não copiadas de tutorial)

- `expo@58.0.17`, `react@19.3.0`, `react-native@0.88.0` — confirmados por `npx expo install --fix` real, depois que `expo-doctor` apontou que os valores anteriores (`react@19.1.0`/`react-native@0.82.0`, herdados sem verificação) estavam desatualizados.
- `expo-camera@58.0.12`, `expo-image-manipulator@58.0.15`, `expo-sqlite@58.0.13` — versões reais da família SDK 58.
- `rn-mlkit-ocr@0.3.1` — candidato primário de OCR (ver `reports/decision.md`, seção 5, para a comparação com a alternativa e as ressalvas sobre New Architecture).

## Importante

- Isto é um protótipo de validação técnica, não a base de código do app final. Nada aqui deve ser copiado para o projeto principal sem revisão (Entrega 1 em diante).
- Nenhuma credencial foi usada (a API pública do TCGdex não exige autenticação). Nenhuma fixture contém dados sensíveis.
- O protótipo não grava nada em inventário/checklist — a "confirmação" na tela serve só para avaliar a PoC.
- Direitos de imagem/marca Pokémon **não foram avaliados** nesta PoC (ver seção 15 da especificação) — continuam bloqueando qualquer publicação comercial.
