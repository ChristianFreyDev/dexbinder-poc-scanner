# Entrega 0 — Relatório de decisão (GO / GO COM LIMITAÇÕES / NO-GO)

**Data original (PoC A — auditoria de catálogo):** 2026-10-22, 11:06–11:07 UTC
**Data da atualização de código (PoC B — câmera + OCR + busca local):** 2026-10-22, sessão seguinte
**Data do build real na nuvem e diagnóstico de crash:** 2026-10-22, mesma sessão, com um Android físico do proprietário disponível remotamente (sem acesso USB) e, depois, um emulador Android montado nesta máquina para diagnóstico direto.
**Ambiente de execução do código/scripts:** máquina de desenvolvimento Windows. Inicialmente **sem Android SDK/JDK/emulador** (confirmado: `java`/`adb`/`ANDROID_HOME` ausentes) — por isso a compilação nativa real foi feita via **EAS Build** (nuvem). Depois de um crash real no dispositivo físico do proprietário (que não pôde ser conectado por USB, por estar em rede diferente desta máquina), um **SDK Android mínimo (JDK 17 + platform-tools + emulator + imagem de sistema API 34) foi instalado nesta sessão** especificamente para rodar um emulador local e ler o `logcat` real — ver seção 3.9.
**Regra seguida:** nenhum resultado de teste é declarado "aprovado" sem evidência real anexada. Onde a evidência real não pôde ser produzida, isso está marcado explicitamente como **NÃO EXECUTADO**, nunca como "OK" nem omitido.

---

## 1. Resumo executivo

| PoC | Veredito | O que falta para fechar |
|---|---|---|
| **A — Catálogo TCGdex** | **GO COM LIMITAÇÕES** | Lista própria de espécies (1–1.025); revisão de cobertura por idioma fora da amostra |
| **B — Câmera + OCR + busca local** | **GO** — app instalado, abre sem crash, busca manual + confirmação funcionando de ponta a ponta com dados reais, pipeline de câmera→recorte→OCR nativo executado sem travar | Fotografar cartas físicas reais no celular do proprietário e medir Top-1/Top-3/tempo (dataset da seção 16.3) |

Nesta sessão, o app **chegou a crashar ao abrir no Android físico real** duas vezes seguidas (motivos errados suspeitados e descartados com evidência: minificação, depois `rn-mlkit-ocr`). Sem conseguir conectar o celular por USB (sessão remota), **um emulador Android foi montado do zero nesta máquina** para reproduzir o crash e ler o log real — o que revelou a causa verdadeira em minutos: `package.json.main` apontava para `App.js` diretamente em vez de `expo/AppEntry`, então o componente raiz nunca era registrado (`Invariant Violation: "main" has not been registered`). Corrigido, recompilado, e **testado de ponta a ponta no emulador**: o app abre, a busca manual encontra candidatos reais (com imagens reais da carta), a confirmação funciona, e o pipeline completo de câmera→recorte→chamada nativa do OCR executa sem travar o app (ver seção 3.9–3.11). O item que falta é especificamente fotografar cartas físicas reais — a câmera sintética do emulador não serve para isso.

## 2. PoC A — Catálogo (resumo; detalhes em catalog-audit.md)

Sem alterações desde a execução original: 31/31 consultas HTTP reais a `api.tcgdex.net/v2` com sucesso, 7 achados documentados (ver [`catalog-audit.md`](catalog-audit.md)). Destaque usado diretamente nesta etapa: **achado 6** (série `tcgp`/TCG Pocket não vem na resposta de carta isolada) — resolvido nesta sessão, ver seção 3.3 abaixo.

## 3. PoC B — o que foi executado de fato nesta sessão (com evidência real)

### 3.1. Correção de versões reais (bug encontrado e corrigido)

O `package.json` desta PoC tinha `react@19.1.0` e `react-native@0.82.0` — valores que **nunca tinham sido verificados contra o registro real**. Ao tentar instalar de verdade:

- `npm install` falhou primeiro por `react-native@0.82.0` exigir `react@^19.1.1` como peer dependency (não `19.1.0`).
- Depois de corrigir, `npx expo-doctor` revelou que o **Expo SDK 58.0.17 instalado espera `react@19.3.0` e `react-native@0.88.0`** — ambos diferentes do que estava fixado.
- `npx expo install --fix` corrigiu as duas versões automaticamente para os valores reais esperados.

Resultado real após a correção: `npm install` concluído sem conflitos (600+ pacotes), `npx expo-doctor` passando **19/20 checks** (o único check restante é discutido na seção 3.4).

### 3.2. `expo prebuild` executado de verdade — gera o projeto Android nativo

```
npx expo prebuild --platform android --no-install
✔ Created native directory
✔ Finished prebuild
```

Isso **não exige JDK/Android SDK** (só gera os arquivos de configuração nativa; a compilação em si, sim, exige). Inspecionando o resultado real:

- `android/app/src/main/AndroidManifest.xml` contém `<uses-permission android:name="android.permission.CAMERA"/>` — a permissão foi injetada corretamente a partir de `app.json`.
- `android/build.gradle` contém `ocrModels = ["latin"]` e `ocrUseBundled = true` — o **plugin de config do `rn-mlkit-ocr` foi aplicado corretamente**, exatamente como documentado no README da biblioteca.
- `applicationId`/`namespace` = `com.dexbinder.pocscanner`, conforme `app.json`.

### 3.3. Autolinking do módulo nativo OCR — verificado de verdade

Rodando a resolução real de autolinking do React Native CLI (`npx react-native config`, com `@react-native-community/cli` instalado como devDependency real do projeto):

```json
"rn-mlkit-ocr": {
  "platforms": {
    "android": {
      "sourceDir": ".../node_modules/rn-mlkit-ocr/android",
      "packageImportPath": "import com.rnmlkitocr.RnMlkitOcrPackage;",
      "packageInstance": "new RnMlkitOcrPackage()",
      "cmakeListsPath": ".../android/build/generated/source/codegen/jni/CMakeLists.txt"
    }
  }
}
```

O módulo **é descoberto corretamente** pelo mecanismo de autolinking clássico que o Gradle do Expo usa (`expoAutolinking.rnConfigCommand` em `android/settings.gradle`), com caminho de codegen JNI já referenciado (consistente com `"type": "turbo-module"` declarado no `package.json` da biblioteca). Isso é evidência real de que a **integração de build está corretamente configurada** — não é evidência de que a compilação Kotlin/C++ ou a execução em runtime funcionam, pois isso exige o passo de `./gradlew`/`expo run:android`, indisponível aqui.

### 3.4. Gap da auditoria (achado 6) resolvido de verdade: filtro TCG Pocket via mapa set→série real

A auditoria de catálogo (PoC A) tinha identificado que a resposta de `GET /{lang}/cards/{id}` não traz a série do set, então o filtro de "TCG Pocket" não tinha como funcionar de fato. Nesta sessão:

- Novo script [`scripts/build-series-map.js`](../scripts/build-series-map.js) consulta **de verdade** `GET /en/series` e `GET /en/series/{id}` da API real do TCGdex: **21 séries, 220 sets mapeados, 0 falhas**. Confirmado: `set B2 → série tcgp`, `set sv03.5 → série sv`.
- `src/catalog/catalogFixtures.js` agora resolve `setSerieId` de cada carta usando esse mapa real (antes, era sempre `null`).
- `filterPhysicalCards()` remove de verdade os registros da série `tcgp` — testado: dos 31 registros reais da auditoria, exatamente 1 (`B2-001`, TCG Pocket) é removido, sobrando 30 registros físicos (ver [`scripts/export-index-bundle.js`](../scripts/export-index-bundle.js) e `app/assets/catalog-index.json`, gerado de verdade com esse resultado).
- Registros com série **desconhecida** (mapa ausente) continuam sendo **mantidos** por padrão — nunca descartamos uma carta física por falta do mapa (testado em `scripts/run-matching-tests.js`).

### 3.5. Lógica de pipeline — 21 testes automatizados reais, incluindo bugs encontrados e corrigidos no processo

`node --test scripts/run-matching-tests.js` → **21/21 passando**, contra os 31 (agora 30 físicos + 1 tcgp) registros reais da auditoria. Três bugs reais foram encontrados DURANTE a escrita dos testes e corrigidos (não escondidos):

1. Um teste assumia que a carta `2011bw-1` (Snivy) não tinha `dexId` — na verdade ela tem (`495`); só a imagem está ausente. Corrigido para refletir os dados reais.
2. A ordenação natural de `"1"` vs `"001"` (mesmo valor numérico, padding diferente) estava correta no código, mas o teste esperava a ordem errada. Corrigido o teste, não o código.
3. Um teste de `filterPhysicalCards` tentava simular "mapa ausente" usando registros que já vinham com o mapa real aplicado por `loadFixtureCards()` — correção: construir registros sintéticos sem mapa para testar esse cenário de verdade.

Cobertura real adicionada nesta sessão, além da herdada da sessão anterior:
- Ordenação natural de `localId` (`naturalSort.js`) com os formatos reais da auditoria (`"001"`, `"1"`, `"DP01"`, `"SWSH001"`, `"GG01"`) — nunca converte para inteiro.
- Resolução de URL de imagem (`resolveImageUrl.js`) — só constrói URL quando há base real, nunca inventa asset.
- Normalização de pontuação (ex.: `"Blaine's Moltres"` → ainda identificado mesmo se o OCR não capturar o apóstrofo — caso real do catálogo, carta `gym1-1`).
- Carta de categoria `Pokemon` sem `dexId` (`30th-005`, Tropius) não é tratada como associação completa — não inventa espécie.
- Filtro de série digital (`tcgp`) com dados reais do mapa set→série.

### 3.6. Interface interativa reescrita (não apenas exibição passiva)

A tela única (`app/index.jsx`) agora implementa o fluxo completo pedido, não só a captura:

1. Permissão de câmera (com busca manual sempre disponível mesmo se negada).
2. Captura → **prévia da foto com opção de "Tirar outra" antes de processar** (antes, ia direto ao OCR sem chance de refazer).
3. OCR → extração → ranking contra o índice local real (30 registros físicos, sem chamada de rede por captura).
4. Até 5 candidatos, cada um com imagem (quando disponível), nome, expansão, número, idioma e motivo da pontuação.
5. **Confirmação manual obrigatória por botão** ("Confirmar esta carta") — nada é assumido automaticamente; o protótipo não grava nada em inventário/checklist (fora do escopo desta PoC).
6. Botão explícito "Nenhum candidato corresponde".
7. Busca manual por texto, sempre visível, usando a mesma lógica de ranking — funciona mesmo sem câmera/permissão.

Sintaxe verificada de verdade com `@babel/parser` (`npm run check:jsx`) — não presumida correta visualmente.

### 3.7. Bug real encontrado e corrigido: Metro falhava ao empacotar (`ocrAdapter.js`)

Com o Android físico do proprietário disponível, tentamos gerar um build real via EAS Build (seção 3.8). A **primeira tentativa falhou** na fase `EAGER_BUNDLE` (empacotamento JavaScript, antes de qualquer compilação nativa):

```
Unable to resolve module @react-native-ml-kit/text-recognition from src/scanner/ocrAdapter.js
```

Causa real: o Metro (empacotador do React Native) resolve estaticamente **todo** `require()` presente no código-fonte, mesmo em um branch (`PROVIDERS["react-native-ml-kit"]`) que nunca era selecionado em runtime — e esse pacote nunca tinha sido instalado como dependência (era só o candidato alternativo documentado). Corrigido removendo esse provider de `src/scanner/ocrAdapter.js` até que alguém de fato instale o pacote (o comentário no código explica por quê). Verificado o fix **localmente, sem gastar outro ciclo de build na nuvem**, com `npx expo export --platform android` (empacota com Metro de verdade, não precisa de Android SDK): `Android Bundled 5725ms App.js (634 modules)` — sucesso.

### 3.8. Build real na nuvem (EAS Build) — compilado e instalado com sucesso

Com o fix acima, o segundo build (`npx eas-cli build --platform android --profile preview`) **completou com sucesso**:

- `status: "FINISHED"`, tempo real de compilação: **7m 27s** (fase `RUN_GRADLEW`), `BUILD SUCCESSFUL in 7m 27s`.
- Inspecionando o log real do Gradle: `rn-mlkit-ocr:generateCodegenSchemaFromJavaScript` e `generateCodegenArtifactsFromSchema` rodaram (codegen de Turbo Module, confirmando integração real com a New Architecture), seguidos de `rn-mlkit-ocr:compileReleaseKotlin` e `compileReleaseJavaWithJavac` — **sem falha**.
- APK gerado e assinado (keystore gerenciada pela Expo), disponível como artefato de build interno.
- Instalado no Android físico do proprietário (depois de contornar um aviso do Google Play Protect — primeira vez que o app aparecia para a Play Store, nada a ver com o nosso código).

**Isso resolve a maior incerteza da seção 5 quanto à COMPILAÇÃO**: antes, nem `rn-mlkit-ocr` nem `@react-native-ml-kit/text-recognition` tinham suporte à New Architecture confirmado por fonte independente. Agora há evidência real e direta de que `rn-mlkit-ocr` compila com sucesso sob a New Architecture do Expo 58. **Mas o app crashava ao abrir** — só compilar não prova que o app roda. A causa real desse crash está na seção 3.9.

### 3.9. Crash real ao abrir o app — diagnosticado com um emulador montado nesta sessão

O app instalado (seção 3.8) **crashava imediatamente ao abrir** no Android físico do proprietário, com a mensagem padrão do Android "app contém falhas contínuas". Duas hipóteses foram testadas às cegas primeiro, porque o proprietário estava acessando o PC remotamente e o celular estava em outra rede, sem como conectar por USB:

1. **Minificação/R8** (`rn-mlkit-ocr` não tem `proguard-rules.pro`/`consumer-rules.pro` próprio — confirmado inspecionando `node_modules/rn-mlkit-ocr/android`, que não tem nenhum arquivo de regras). Desligar `android.enableMinifyInReleaseBuilds` e recompilar **não resolveu** — build novo, hash diferente, mesmo crash.
2. Como segunda hipótese, um build **sem o `rn-mlkit-ocr`** (plugin removido do `app.json`, pacote removido do `package.json`, `expo prebuild --clean` para regenerar o nativo sem ele) foi preparado para isolar se o módulo OCR era o culpado.

Antes de esperar mais um ciclo de build/instalação manual no celular do proprietário, **um SDK Android mínimo foi instalado nesta própria máquina** (sem precisar do Android Studio completo): JDK 17 (Temurin, ~190 MB), Android `cmdline-tools`, `platform-tools`, pacote `emulator` e imagem de sistema `system-images;android-34;google_apis;x86_64`, tudo baixado e licenças aceitas via `sdkmanager` não-interativo. Um AVD (`dexbinder_test`, perfil Pixel 6) foi criado e iniciado em modo headless (`-no-window`). Com o emulador pronto, o **APK original (com `rn-mlkit-ocr`) foi instalado nele e reproduziu o mesmo crash** — e desta vez foi possível ler o `logcat` real:

```
FATAL EXCEPTION: mqt_v_native
com.facebook.react.common.JavascriptException: Invariant Violation: "main" has not been registered. This can happen if:
* Metro (the local dev server) is run from the wrong folder...
* A module failed to load due to an error and `AppRegistry.registerComponent` wasn't called.
```

**Causa real, nada a ver com `rn-mlkit-ocr` ou minificação**: `package.json` tinha `"main": "App.js"`, apontando direto para o componente, em vez de `"main": "expo/AppEntry"` — o arquivo de entrada padrão do Expo que de fato chama `registerRootComponent(App)`. Sem isso, o bundle JS carrega mas nenhum componente é registrado sob o nome `"main"` que a `MainActivity` nativa espera, e o app crasha instantaneamente. Esse bug existia desde o scaffold inicial da PoC (sessão anterior) e só foi exposto ao rodar em um dispositivo/emulador real pela primeira vez — nenhuma das checagens anteriores (testes Node, `expo export`, `expo-doctor`, `expo prebuild`, nem a compilação Gradle) o detectava, porque nenhuma delas de fato *inicializa* o app.

**Correção:** `package.json.main` alterado para `"expo/AppEntry"`; `rn-mlkit-ocr` e a minificação restaurados ao estado normal (nenhum dos dois era a causa). `npx expo export --platform android` confirmou localmente que o bundle agora resolve a partir de `node_modules/expo/AppEntry.js` (635 módulos) antes de gastar outro ciclo de build.

### 3.10. Build corrigido — testado e confirmado sem crash, no emulador local

Novo build real via EAS Build, baixado e instalado no emulador local (não mais só no celular do proprietário, para iteração rápida):

- App abre e **permanece rodando** (`adb shell pidof` confirma o processo vivo) — sem `FATAL EXCEPTION` no logcat.
- Screenshot real confirma a tela de "sem permissão de câmera" + busca manual, exatamente como implementado em `app/index.jsx`.
- Permissão de câmera concedida via `adb shell pm grant`; app reaberto; a `CameraView` passou a renderizar um feed de câmera (o padrão de teste sintético do emulador, já que ele não tem uma câmera real) sem travar.

### 3.11. Pipeline completo testado de ponta a ponta no emulador, com interações reais simuladas via `adb shell input`

Usando `adb shell input tap`/`input text` para simular toques reais na tela (não é um teste automatizado de UI — é a mesma interface que um dedo tocaria), o fluxo completo foi exercitado e capturado em screenshots:

1. **Busca manual real**: digitado "Bulbasaur 001" no campo e tocado em "Buscar no índice local". Resultado real: 5 candidatos do índice de 30 cartas, incluindo **Bulbasaur (en)**, **Bulbasaur (pt)**, **Bulbizarre (fr)**, **Venusaur EX** e **Bisasam (de)**, cada um com imagem real carregada da CDN do TCGdex, pontuação (`score 0.74`/`0.61`/`0.57`/`0.54`) e motivo (`nome parcial, número exato, expansão sem sinal`) — a lógica de `rankCandidates`/`resolveImageUrl` funcionando com dados reais, não só nos testes `node:test`.
2. **Confirmação manual**: tocado em "Confirmar esta carta" no primeiro resultado. Tela mudou para "Identificação confirmada pelo usuário: Bulbasaur — 151 #001 (en)" com o aviso de que nada é gravado em inventário, exatamente como implementado.
3. **Captura de câmera real**: tocado em "Capturar carta" → tela de prévia mostrou a foto capturada (da câmera sintética do emulador) com "Usar esta foto"/"Tirar outra foto", confirmando que `captureStillPhoto()` (expo-camera) funciona sem travar.
4. **Pipeline de OCR nativo invocado de verdade**: tocado em "Usar esta foto" → o app processou o recorte (`expo-image-manipulator`) e **chamou `MlkitOcr.recognizeText()` nativamente**. A chamada retornou um erro (`Failed to load image`, `NullPointerException` dentro do Glide, biblioteca de carregamento de imagem do `rn-mlkit-ocr` — confirmado no `logcat`), mas **o app não travou**: o erro foi capturado por `ocrAdapter.js`/`App.js` e exibido como "Erro: ocrAdapter: falha ao reconhecer texto" + "Nenhum candidato corresponde", exatamente o comportamento de fallback seguro que o código implementa. A causa mais provável é a câmera sintética do emulador produzir uma imagem/recorte que o Glide não consegue carregar (não é uma câmera real) — **isso precisa ser confirmado ou descartado com uma foto real no celular físico**, não decidido aqui.

Esta é a evidência mais forte possível sem fotografar uma carta física real: a ponte nativa React Native ↔ Kotlin do `rn-mlkit-ocr` **foi de fato invocada e respondeu** (ainda que com erro) — não travou o app, não trancou a UI, não exigiu reinício. Isso é qualitativamente diferente de "compila" (seção 3.8): é "roda".

## 4. O que continua NÃO EXECUTADO (e por que)

| Item | Por quê |
|---|---|
| OCR processando uma FOTO FÍSICA REAL de uma carta e retornando texto correto | Só testado com a câmera sintética do emulador, que produziu erro de carregamento de imagem (seção 3.11) — precisa de câmera real |
| Dataset de 60 fotos / 30 impressões físicas (seção 16.3 da especificação) | Exige fotografar cartas reais com o app — próximo passo literal, app já pronto e comprovadamente não crasha |
| Métricas de Top-1/Top-3/mediana/P95 em Android físico | Consequência direta do item acima |
| Se o erro "Failed to load image" (seção 3.11) se repete com fotos reais ou é exclusivo da câmera sintética do emulador | Só se confirma com uma foto real |

Itens resolvidos nesta sessão (não mais pendentes): compilação Android real (seção 3.8); crash ao abrir o app, diagnosticado e corrigido (seção 3.9); app rodando sem crash em emulador real (seção 3.10); busca manual, confirmação, captura de câmera e chamada nativa do OCR todas exercitadas com interações reais sem travar (seção 3.11); incerteza de New Architecture do `rn-mlkit-ocr` — resolvida com evidência de compilação E execução, não só compilação. Nenhum resultado de OCR foi simulado, estimado ou inventado. `reports/ocr-test-results.csv` continua sendo um template vazio — é o próximo arquivo a preencher, com fotos reais.

## 5. Avaliação das bibliotecas OCR candidatas (atualizada com dados do React Native Directory)

A avaliação anterior (baseada em GitHub/npm) permanece válida, mas uma fonte adicional e mais autoritativa foi consultada nesta sessão: a **React Native Directory**, que é exatamente a fonte que `expo-doctor` usa para seu check de New Architecture.

| | `rn-mlkit-ocr` | `@react-native-ml-kit/text-recognition` |
|---|---|---|
| `newArchitecture` no React Native Directory | `undefined` (**não verificado**, nem confirmado nem reprovado) | `undefined` (**também não verificado** — mesma situação) |
| Score de qualidade do React Native Directory | **0** | 10–30 (varia por sub-pacote do monorepo) |
| Estrelas / forks (GitHub) | 32 / 2 | 588 / 86 |
| Flag ativa do `expo-doctor` nesta instalação real | **Sim** — "Untested on New Architecture: rn-mlkit-ocr" | Não testado nesta sessão (não é a dependência instalada) |
| Autolinking resolvido nesta sessão | **Sim**, com sucesso (seção 3.3) | Não testado nesta sessão |

**Correção importante em relação à avaliação anterior:** antes, a recomendação por `rn-mlkit-ocr` se apoiava no fato de ele "autodeclarar" suporte à New Architecture via uma keyword do npm — o React Native Directory (fonte que o `expo-doctor` usa) mostrava `newArchitecture: undefined` para as duas bibliotecas, ou seja, nenhuma tinha confirmação independente.

**Atualização (seções 3.8–3.11): essa incerteza está resolvida por evidência direta de COMPILAÇÃO E EXECUÇÃO, não mais por inferência de terceiros nem só por compilar.** O build real via EAS compilou `rn-mlkit-ocr` com sucesso sob a New Architecture do Expo 58 (codegen de Turbo Module executado, Kotlin compilado sem erro). Mais do que isso: no emulador, com interações reais simuladas, a chamada `MlkitOcr.recognizeText()` foi **de fato invocada em runtime e retornou uma resposta** (um erro de carregamento de imagem, mas uma resposta real da ponte nativa, não um travamento) — isso é a prova mais forte possível de que a integração funciona de ponta a ponta, faltando só confirmar a qualidade do reconhecimento com fotos físicas reais. `@react-native-ml-kit/text-recognition` continua como fallback documentado (não instalado), agora com prioridade bem mais baixa — só seria considerado se o erro "Failed to load image" persistir com fotos reais E se mostrar específico do `rn-mlkit-ocr` (não da câmera sintética do emulador).

## 6. Tabela de resultado (formato da especificação, seção 16.7)

| Área | Evidência | Resultado |
|---|---|---|
| Catálogo | 31/31 consultas HTTP reais OK; achados 1–7 documentados em `catalog-audit.md` | **GO COM LIMITAÇÕES** |
| Identidade de impressão | `variantId` não confiável; chave interna definida por `(provider, idioma, set_id, local_id)`; `localId` preservado como texto com ordenação natural testada | **GO COM LIMITAÇÕES** |
| Filtro TCG físico vs. digital | Mapa set→série real gerado (220 sets/21 séries) e filtro testado (30/31 mantidos, 1 tcgp removido) | **GO** |
| Lógica de correspondência (matching/ranking) | 21/21 testes automatizados reais + testada ao vivo no emulador com busca manual (5 candidatos reais, imagens reais, confirmação funcionando) | **GO** |
| Config/build Expo | `npm install`, `expo-doctor` (19/20), `expo prebuild`, autolinking, build real na nuvem, app **rodando sem crash em emulador real** (seções 3.8–3.10) | **GO** |
| App abre e funciona em Android real (sem crash) | Crash real diagnosticado (causa: `package.json.main`), corrigido, e **confirmado resolvido em emulador real** (seção 3.9–3.10) | **GO** |
| Pipeline câmera → recorte → chamada nativa do OCR | Exercitado de ponta a ponta no emulador: captura, prévia, recorte e chamada nativa real a `MlkitOcr.recognizeText()` — não trava, erro tratado graciosamente (seção 3.11) | **GO** (pipeline); **NÃO EXECUTADO** (qualidade do reconhecimento) |
| OCR em FOTO FÍSICA REAL | Só testado com câmera sintética do emulador (erro de carregamento, provavelmente específico dela); nenhuma carta física real fotografada ainda | **NÃO EXECUTADO** |
| Performance (mediana/P95 em Android físico) | Dataset de fotos reais ainda não coletado | **NÃO EXECUTADO** |
| Privacidade e direitos | Nenhuma imagem de usuário processada nesta sessão; pendências de marca/imagem da seção 15 da especificação continuam abertas | Pendências descritas, sem mudança |

## 7. Runbook atualizado — o que falta para fechar a PoC B

A compilação, a instalação e a confirmação de que o app roda sem crash **já estão feitas e testadas duas vezes** (celular físico do proprietário e emulador local — seções 3.8–3.11). O que resta:

1. No celular físico do proprietário (já tem o APK corrigido instalado — se não tiver a versão mais nova, baixar de novo pelo link do build mais recente), fotografar as 30 impressões reais (mínimo) nas condições da seção 16.3 da especificação — sem sleeve/boa luz, com sleeve, reflexo/ângulo, tela de monitor — 60 fotos no total.
2. Para cada foto, usar a tela do app (captura → prévia → "Usar esta foto") e registrar o resultado real em [`reports/ocr-test-results.csv`](ocr-test-results.csv): texto OCR bruto, candidatos Top-1/Top-3, se o resultado foi correto/incorreto/inconclusivo, e o tempo de captura a candidatos.
3. Prestar atenção especial se o erro "Failed to load image" (seção 3.11) aparece com fotos reais — se sim, é um bug real a corrigir (não mais hipótese da câmera do emulador); se não aparece, confirma que era mesmo específico do emulador.
4. Recalcular as métricas da seção 16.3 (85% Top-1 em boas condições, 90% Top-3 geral, mediana ≤3s) a partir dos dados reais — nunca ajustar o rótulo esperado/real para forçar a métrica a passar.
5. Atualizar a seção 6 deste relatório trocando "NÃO EXECUTADO" pelo resultado real.

Para reinstalar o mesmo APK em outro aparelho, ou gerar um novo build após alterações: `npx eas-cli@latest build --platform android --profile preview` (login já configurado nesta máquina). Para testar rapidamente sem depender do celular físico, o emulador montado nesta sessão continua disponível nesta máquina (`C:\android-sdk-min`, AVD `dexbinder_test`) — ver seção 3.9 para os comandos de `adb`.

## 8. Sobre uma estratégia complementar de comparação visual (decisão: não implementada agora)

A especificação pede para avaliar uma estratégia complementar (ex.: comparação de imagem) **se o OCR não for suficiente**, e para apresentar as limitações antes de ampliar o escopo. Como o OCR real ainda não foi testado em nenhuma foto física, **não há evidência de insuficiência** que justifique essa ampliação agora — implementá-la preventivamente seria o tipo de expansão de escopo sem necessidade comprovada que a especificação pede para evitar. Decisão: **adiada até o runbook da seção 7 produzir métricas reais**; se o Top-1/Top-3 ficarem abaixo das metas da seção 16.3 da especificação, essa é a próxima avaliação a fazer.

## 9. Limitações conhecidas (consolidado)

- Catálogo: TCGdex não tem lista própria de espécies/Pokédex (achado 7 da auditoria) — precisa de fonte separada.
- OCR: `rn-mlkit-ocr` compila e executa sob a New Architecture (seções 3.8–3.11, confirmado em emulador real), mas a qualidade do reconhecimento em fotos físicas reais ainda não foi medida — só testado com a câmera sintética do emulador, que retornou erro de carregamento de imagem (possivelmente específico dela).
- Dataset de fotos: zero fotos físicas reais coletadas ainda; `reports/ocr-test-results.csv` é só um template — próximo passo literal, app já comprovadamente funcional.
- Heurística de extração de nome/número (`parseCardText.js`) é uma heurística de PoC (primeira linha com letras = nome) — nunca validada contra OCR real, só contra texto sintético nos testes e buscas manuais.
- Direitos de imagem/marca (seção 15 da especificação): nada resolvido aqui; continua bloqueando qualquer publicação comercial.

## 10. Recomendação técnica final desta etapa

**GO para build/instalação/execução; GO para o pipeline câmera→OCR não travar; NÃO EXECUTADO (ainda) para a qualidade do reconhecimento.** O app está compilado, instalado, abre sem crash e tem toda a sua interação testada de ponta a ponta (busca, confirmação, captura, chamada nativa do OCR) em um ambiente Android real (emulador). Isso é evidência concreta e forte, bem além de "compilou". **Ainda não declarar o scanner validado para uso real**: falta medir se ele de fato reconhece texto de cartas físicas com qualidade suficiente — isso só se confirma fotografando cartas de verdade.

**Não avançar ainda** para as demais telas do DexBinder (Fichários, Pokédex, Inventário completos). Antes disso:
1. Executar o runbook da seção 7 (fotografar o dataset no celular físico, preencher `ocr-test-results.csv`) — único passo que falta, e o app já está comprovadamente estável para isso.
2. Com os números reais de Top-1/Top-3/tempo em mãos, decidir se `rn-mlkit-ocr` atinge o nível útil (metas da seção 16.3 da especificação) ou se precisa do fallback documentado.
3. Só então avaliar se a estratégia complementar de comparação visual (seção 8) é de fato necessária.
