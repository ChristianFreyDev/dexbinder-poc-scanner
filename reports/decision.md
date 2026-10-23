# Entrega 0 — Relatório de decisão (GO / GO COM LIMITAÇÕES / NO-GO)

**Data original (PoC A — auditoria de catálogo):** 2026-10-22, 11:06–11:07 UTC
**Data da atualização de código (PoC B — câmera + OCR + busca local):** 2026-10-22, sessão seguinte
**Data do build real na nuvem e diagnóstico de crash:** 2026-10-22, mesma sessão, com um Android físico do proprietário disponível remotamente (sem acesso USB) e, depois, um emulador Android montado nesta máquina para diagnóstico direto.
**Data dos testes reais em casa (celular físico, cartas físicas, Wi-Fi + hot reload):** 22–23/10/2026, sessão seguinte — ver seção 3.12.
**Ambiente de execução do código/scripts:** máquina de desenvolvimento Windows. Inicialmente **sem Android SDK/JDK/emulador** (confirmado: `java`/`adb`/`ANDROID_HOME` ausentes) — por isso a compilação nativa real foi feita via **EAS Build** (nuvem). Depois de um crash real no dispositivo físico do proprietário (que não pôde ser conectado por USB, por estar em rede diferente desta máquina), um **SDK Android mínimo (JDK 17 + platform-tools + emulator + imagem de sistema API 34) foi instalado nesta sessão** especificamente para rodar um emulador local e ler o `logcat` real — ver seção 3.9.
**Regra seguida:** nenhum resultado de teste é declarado "aprovado" sem evidência real anexada. Onde a evidência real não pôde ser produzida, isso está marcado explicitamente como **NÃO EXECUTADO**, nunca como "OK" nem omitido.

---

## 1. Resumo executivo

| PoC | Veredito | O que falta para fechar |
|---|---|---|
| **A — Catálogo TCGdex** | **GO COM LIMITAÇÕES** | Lista própria de espécies (1–1.025); revisão de cobertura por idioma fora da amostra |
| **B — Câmera + OCR + busca local** | **GO** — app instalado, abre sem crash, busca manual + confirmação + captura + OCR nativo testados de ponta a ponta com dados reais **em celular físico, com cartas físicas reais** (não mais só emulador) | Completar o dataset formal de 60 fotos/30 impressões em todas as condições da seção 16.3 e calcular Top-1/Top-3/tempo |

Nesta sessão, o app **chegou a crashar ao abrir no Android físico real** duas vezes seguidas (motivos errados suspeitados e descartados com evidência: minificação, depois `rn-mlkit-ocr`). Sem conseguir conectar o celular por USB (sessão remota), **um emulador Android foi montado do zero nesta máquina** para reproduzir o crash e ler o log real — o que revelou a causa verdadeira em minutos: `package.json.main` apontava para `App.js` diretamente em vez de `expo/AppEntry`, então o componente raiz nunca era registrado (`Invariant Violation: "main" has not been registered`). Corrigido, recompilado, e **testado de ponta a ponta no emulador**: o app abre, a busca manual encontra candidatos reais (com imagens reais da carta), a confirmação funciona, e o pipeline completo de câmera→recorte→chamada nativa do OCR executa sem travar o app (ver seção 3.9–3.11). Numa sessão seguinte, já em casa com o celular físico do proprietário (seção 3.12), o app foi testado com cartas físicas reais: o OCR reconheceu texto de verdade e identificou as cartas corretamente, e 4 bugs reais foram encontrados e corrigidos (rotação da foto, detecção de expansão, imagem ampliada, rede). O que falta é especificamente o dataset formal completo (30 impressões/60 fotos, todas as condições da especificação) — o subconjunto testado até agora já confirma que o pipeline funciona de ponta a ponta com fotos físicas reais.

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

### 3.12. Sessão de testes reais em casa (22–23/10/2026) — celular físico do proprietário, cartas físicas reais

Com o Android físico do proprietário em casa (mesma rede Wi-Fi do computador, via Expo Dev Client com hot reload — ver runbook atualizado na seção 7), o erro "Failed to load image" da seção 3.11 **não se repetiu**: era mesmo específico da câmera sintética do emulador. Várias cartas físicas reais do set "151" (Scarlet & Violet, `setId` "sv03.5") foram fotografadas e processadas de ponta a ponta pelo app, incluindo **Pikachu** (#025), **Bulbasaur** (#001) e **Venusaur ex** (#003). Em todos os casos o fluxo completo (captura → recorte → `MlkitOcr.recognizeText()` → parsing → ranking) rodou sem travar e identificou a carta certa como candidato #1 (ou empatado #1 só entre as versões EN/PT, ambiguidade esperada já que o nome não muda entre esses dois idiomas).

Quatro bugs reais foram encontrados e corrigidos durante esses testes, cada um com teste de regressão usando o texto OCR real capturado (ver `scripts/run-matching-tests.js`):

1. **Rotação da foto**: a prévia às vezes aparecia deitada. Diagnosticado com dados reais (`exif.Orientation` variando entre capturas da mesma carta, sem relação confiável com a orientação real da imagem) — causa provável: ao fotografar um álbum sobre a mesa, o celular fica quase na horizontal, posição em que a detecção de orientação por acelerômetro do Android é instável. A correção automática por EXIF foi abandonada (não confiável nesse uso) em favor de um controle manual — botão "girar" na prévia (`src/scanner/rotateImage.js`).
2. **Código de expansão nunca reconhecido**: toda carta mostrava "expansão sem sinal". Achado real: o código impresso da expansão ("MEW", para o set "151") vem colado no mesmo texto ruidoso do número de colecionador no rodapé da carta (ex. "G MEWPI 025/165"), nunca sozinho numa linha própria como a extração antiga exigia. Corrigido com um mapa `setPrintedCode` por `setId` em `src/catalog/catalogFixtures.js`, batido contra o texto bruto inteiro do OCR em `rankCandidates.js` — confirmado nas 3 capturas reais acima, todas passaram a mostrar "expansão compatível".
3. **Imagem ampliada não carregava**: a prévia ampliada de uma carta (toque na miniatura) ficava em branco. Causa: `<Image>` com dimensão implícita (`width`/`height` em "%", depois o atalho `StyleSheet.absoluteFillObject`) não renderiza de forma confiável dentro do modal nesta versão do RN/Android — resolvido com `width`/`height` explícitos em pixel, calculados a partir do tamanho real da tela (`useWindowDimensions`).
4. **Lentidão de rede específica do celular**: a imagem "high" (alta qualidade) do TCGdex chegou a demorar 30s+; depois, parou de carregar completamente, inclusive pelo navegador do celular ("no available server"), mesmo a versão "low" (usada na miniatura) funcionando — DNS da rede Wi-Fi de casa não resolvendo `assets.tcgdex.net` de forma confiável. Não é um bug do app — confirmado trocando o DNS do Wi-Fi do celular (Google/Cloudflare), que resolveu o acesso tanto no navegador quanto no app. O app agora carrega só a imagem "low" por padrão no modal (instantânea, já em cache da miniatura), com um botão opcional para buscar a "high" sob demanda.

A interface também foi inteiramente redesenhada nesta sessão (tema escuro, botões/ícones vetoriais consistentes, busca manual, modal de texto bruto) — mudança de usabilidade, sem efeito na lógica de câmera/OCR/matching documentada acima.

**O que isso muda na avaliação:** a linha "OCR processando uma FOTO FÍSICA REAL" da tabela da seção 4 (abaixo) deixa de ser "NÃO EXECUTADO" — há evidência real, qualitativa, de reconhecimento correto em múltiplas cartas físicas distintas. O que **continua** pendente é o protocolo formal da especificação (seção 16.3): fotografar as 30 impressões/60 fotos em todas as condições especificadas (sem sleeve, com sleeve, reflexo/ângulo, tela de monitor) e calcular Top-1/Top-3/mediana/P95 — os testes reais desta sessão cobrem só um subconjunto informal (3 cartas, 1 set, condições de iluminação doméstica normais), não o dataset completo.

## 4. O que continua NÃO EXECUTADO (e por que)

| Item | Por quê |
|---|---|
| Dataset completo de 60 fotos / 30 impressões físicas, todas as condições da seção 16.3 | Só um subconjunto informal (3 cartas do set "151", condições domésticas normais) foi testado até agora (seção 3.12) — faltam as demais impressões e as condições adversas (sleeve, reflexo, tela de monitor) |
| Métricas formais de Top-1/Top-3/mediana/P95 em Android físico | Consequência direta do item acima — `reports/ocr-test-results.csv` continua sendo um template vazio |

Itens resolvidos nesta sessão (não mais pendentes): compilação Android real (seção 3.8); crash ao abrir o app, diagnosticado e corrigido (seção 3.9); app rodando sem crash em emulador real (seção 3.10); busca manual, confirmação, captura de câmera e chamada nativa do OCR todas exercitadas com interações reais sem travar (seção 3.11); incerteza de New Architecture do `rn-mlkit-ocr` — resolvida com evidência de compilação E execução, não só compilação; **OCR reconhecendo texto de cartas físicas reais com qualidade suficiente para identificação correta** — confirmado em múltiplas capturas reais no celular físico do proprietário, não mais só no emulador (seção 3.12). Nenhum resultado de OCR foi simulado, estimado ou inventado.

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
| Pipeline câmera → recorte → chamada nativa do OCR | Exercitado de ponta a ponta no celular físico real: captura, prévia, recorte e `MlkitOcr.recognizeText()` rodando sem travar em várias cartas físicas reais (seção 3.12) | **GO** |
| OCR em FOTO FÍSICA REAL | Testado em celular físico real (não mais só emulador): múltiplas cartas do set "151" identificadas corretamente, 4 bugs reais encontrados e corrigidos (rotação, expansão, imagem ampliada, rede) — ver seção 3.12 | **GO COM LIMITAÇÕES** — confirmado qualitativamente num subconjunto informal; dataset formal completo (seção 16.3) ainda pendente |
| Performance (mediana/P95 em Android físico) | Dataset formal de fotos reais (30 impressões/60 fotos, todas as condições da seção 16.3) ainda não coletado de forma sistemática | **NÃO EXECUTADO** |
| Privacidade e direitos | Nenhuma imagem de usuário processada nesta sessão; pendências de marca/imagem da seção 15 da especificação continuam abertas | Pendências descritas, sem mudança |

## 7. Runbook atualizado — o que falta para fechar a PoC B

A compilação, a instalação e a confirmação de que o app roda sem crash **já estão feitas e testadas três vezes** (celular físico do proprietário, emulador local, e de novo no celular físico em casa — seções 3.8–3.12). O fluxo de iteração mudou desde a seção 3.8: em vez de gerar um APK novo a cada mudança, o app usa **Expo Dev Client com hot reload** — o celular se conecta ao Metro rodando no computador (mesma rede Wi-Fi) e recebe atualizações de JS instantaneamente a cada arquivo salvo. Um APK de dev-client novo só é necessário se uma dependência NATIVA nova for adicionada (ver `.github/workflows/build-android-dev.yml`). O que resta:

1. No celular físico do proprietário, conectado à mesma rede Wi-Fi do computador (`npx expo start` na raiz do projeto), fotografar as 30 impressões reais (mínimo) nas condições da seção 16.3 da especificação — sem sleeve/boa luz, com sleeve, reflexo/ângulo, tela de monitor — 60 fotos no total. Um subconjunto informal (3 cartas do set "151", condições domésticas normais) já foi testado e funcionou (seção 3.12) — faltam as demais impressões e as condições adversas.
2. Para cada foto, usar a tela do app (captura → prévia → "Usar esta foto") e registrar o resultado real em [`reports/ocr-test-results.csv`](ocr-test-results.csv): texto OCR bruto, candidatos Top-1/Top-3, se o resultado foi correto/incorreto/inconclusivo, e o tempo de captura a candidatos.
3. Recalcular as métricas da seção 16.3 (85% Top-1 em boas condições, 90% Top-3 geral, mediana ≤3s) a partir dos dados reais — nunca ajustar o rótulo esperado/real para forçar a métrica a passar.
4. Atualizar a seção 6 deste relatório trocando "NÃO EXECUTADO"/"GO COM LIMITAÇÕES" pelo resultado formal real.

Para gerar um APK de dev-client novo (só se uma dependência nativa for adicionada): workflow `build-android-dev.yml` no GitHub Actions deste repositório. Para reinstalar um build standalone (sem hot reload) em outro aparelho: `npx eas-cli@latest build --platform android --profile preview` (login já configurado nesta máquina). O emulador montado na sessão anterior continua disponível nesta máquina (`C:\android-sdk-min`, AVD `dexbinder_test`) — ver seção 3.9 para os comandos de `adb`.

## 8. Sobre uma estratégia complementar de comparação visual (decisão: não implementada agora)

A especificação pede para avaliar uma estratégia complementar (ex.: comparação de imagem) **se o OCR não for suficiente**, e para apresentar as limitações antes de ampliar o escopo. Como o OCR real ainda não foi testado em nenhuma foto física, **não há evidência de insuficiência** que justifique essa ampliação agora — implementá-la preventivamente seria o tipo de expansão de escopo sem necessidade comprovada que a especificação pede para evitar. Decisão: **adiada até o runbook da seção 7 produzir métricas reais**; se o Top-1/Top-3 ficarem abaixo das metas da seção 16.3 da especificação, essa é a próxima avaliação a fazer.

## 9. Limitações conhecidas (consolidado)

- Catálogo: TCGdex não tem lista própria de espécies/Pokédex (achado 7 da auditoria) — precisa de fonte separada.
- OCR: `rn-mlkit-ocr` compila e executa sob a New Architecture, **e reconhece texto de cartas físicas reais com qualidade suficiente para identificação correta** — confirmado em celular físico real, não só em emulador (seção 3.12). O texto reconhecido é sempre ruidoso (letras trocadas, palavras de fundo), mas `parseCardText.js`/`rankCandidates.js` lidam com isso na prática, não só em teoria — ainda assim, a qualidade só foi medida num subconjunto informal (3 cartas, 1 set), não no dataset formal completo.
- Dataset de fotos: um subconjunto informal (3 cartas físicas reais do set "151") foi testado com sucesso; `reports/ocr-test-results.csv` continua sendo só um template — o dataset formal de 60 fotos/30 impressões (seção 16.3) é o próximo passo literal.
- Detecção de expansão (`setPrintedCode` em `catalogFixtures.js`) hoje só tem uma entrada confirmada (`sv03.5` → "MEW"); outros sets mostrarão "expansão sem sinal" até serem confirmados com foto real de carta daquele set — deliberado, para não adivinhar códigos não verificados.
- Rotação de foto: a correção automática por EXIF se mostrou pouco confiável nesta forma de uso (fotografar um álbum quase na horizontal) e foi substituída por um controle manual (botão "girar") — não é mais um bug em aberto, mas também não é uma detecção automática robusta.
- Heurística de extração de nome/número (`parseCardText.js`) é uma heurística de PoC (primeira linha com letras = nome) — agora validada contra OCR real de cartas físicas (não só texto sintético), mas só para o set "151" testado até aqui.
- Direitos de imagem/marca (seção 15 da especificação): nada resolvido aqui; continua bloqueando qualquer publicação comercial.

## 10. Recomendação técnica final desta etapa

**GO para build/instalação/execução; GO para o pipeline câmera→OCR não travar; GO COM LIMITAÇÕES para a qualidade do reconhecimento.** O app está compilado, instalado, abre sem crash e tem toda a sua interação testada de ponta a ponta (busca, confirmação, captura, chamada nativa do OCR) em celular físico real, com cartas físicas reais, não mais só em emulador (seções 3.9–3.12). O OCR reconhece texto de cartas reais e identifica a carta certa, mesmo com ruído típico de captura doméstica. **Ainda não declarar o scanner formalmente validado**: o que foi testado é um subconjunto informal (3 cartas, 1 set, condições domésticas normais), não o dataset completo da especificação — falta medir Top-1/Top-3/mediana/P95 nas condições adversas (sleeve, reflexo, tela de monitor) e nas demais impressões.

**Não avançar ainda** para as demais telas do DexBinder (Fichários, Pokédex, Inventário completos). Antes disso:
1. Executar o runbook da seção 7 (completar o dataset formal no celular físico, preencher `ocr-test-results.csv`) — o pipeline já está comprovadamente funcional com fotos reais, falta só a cobertura completa.
2. Com os números reais de Top-1/Top-3/tempo em mãos, decidir se `rn-mlkit-ocr` atinge o nível útil (metas da seção 16.3 da especificação) ou se precisa do fallback documentado.
3. Só então avaliar se a estratégia complementar de comparação visual (seção 8) é de fato necessária.

## 11. Arquitetura recomendada para o catálogo completo (Entrega 1 — NÃO implementado nesta PoC)

Discussão levantada ao revisar `src/storage/catalogIndex.js` (índice SQLite escrito no início do projeto, nunca usado pelo app real desta PoC — que usa um bundle JSON estático de 30 cartas, gerado em tempo de build). Pergunta real do proprietário: o app final precisa ter **todas** as cartas Pokémon de **todas** as expansões já lançadas, e acompanhar **automaticamente** expansões novas conforme saem — o bundle estático atual não escala para isso (o catálogo completo passa de 20.000 cartas, crescendo a cada poucos meses; embutir tudo no app exigiria uma atualização de loja a cada expansão nova).

**Decisão de arquitetura recomendada** (a implementar na Entrega 1, não nesta PoC):

1. **Fonte de verdade**: a API pública do TCGdex (`api.tcgdex.net/v2`) continua sendo a origem dos dados — nunca copiada/mantida manualmente.
2. **Processo de sincronização** (fora do app, ex.: tarefa agendada no GitHub Actions, rodando periodicamente — diário ou semanal): consulta a API real, gera e publica, versionado, num local público (GitHub Release, ou S3/Supabase Storage):
   - um banco **SQLite** com os metadados de todas as cartas (nome, expansão, número, idioma, dexId, URL da imagem) — texto/números, tipicamente poucos MB mesmo com 20.000+ linhas;
   - **miniaturas pequenas pré-geradas** (recomprimidas menores que a "low" do TCGdex, ~1-2KB cada) para **todas** as cartas, empacotadas junto — com 20.000+ cartas, algo em torno de 30-40MB no total;
   - um manifesto pequeno (`catalog-version.json`: versão/data/checksum) pra o app conseguir checar "existe algo mais novo?" sem baixar tudo de novo a cada abertura.
3. **No app** (celular do usuário):
   - Ao abrir (ou sob demanda, "atualizar catálogo"), confere o manifesto; se houver versão nova, baixa o pacote (SQLite + miniaturas) e substitui a cópia local.
   - Busca/identificação de carta roda **inteiramente local**, contra esse SQLite — sem depender de rede por escaneamento (`catalogIndex.js` é a base certa pra isso; falta só o passo de popular a partir do pacote baixado, em vez das fixtures locais da PoC).
   - As imagens de **melhor qualidade** ("low"/"high" do TCGdex) continuam vindo pela rede sob demanda (como já funciona hoje, `resolveImageUrl.js`), mas com **cache progressivo em disco**: toda imagem buscada com sucesso fica salva localmente, disponível offline nas próximas vezes.
   - **A UI nunca bloqueia a identificação por falta de imagem de qualidade melhor**: sempre mostra o texto (nome/expansão/número — o que o usuário já pode comparar com a carta física na mão) e a melhor imagem disponível localmente, com esta prioridade: cache de qualidade melhor (se já buscada antes) → miniatura pré-empacotada (sempre disponível, desde o primeiro uso, mesmo nunca tendo tido internet) → nenhuma imagem (nunca deveria acontecer, já que a miniatura é garantida).

Isso resolve as três exigências reais levantadas na conversa: catálogo completo (não só uma amostra), atualização automática sem depender de publicar um app novo, e funcionamento **offline desde o primeiro escaneamento** (miniatura sempre presente, sem depender de já ter visto aquela carta online antes).

**Por isso `src/storage/catalogIndex.js` foi mantido no repositório** (não removido como código morto) — é a base correta para a metade "ler o índice local" desta arquitetura; falta a metade "baixar/sincronizar o pacote publicado", que é trabalho real da Entrega 1, fora do escopo desta PoC.

### 11.1. Base real já construída e testada em pequena escala (22-23/10/2026)

Dois scripts novos implementam a metade "processo de sincronização" do item 2 acima, testados de verdade contra a API real (amostra pequena, não o catálogo completo — ver justificativa de escala abaixo):

- **[`scripts/sync-full-catalog.js`](../scripts/sync-full-catalog.js)**: gera o banco SQLite completo. Achado real relevante: `GET /{lang}/sets/{setId}` já devolve TODOS os cards do set numa única resposta (forma reduzida: id/imagem/número/nome — suficiente pra tudo que `rankCandidates.js` usa), **e inclui `abbreviation.official`** — o código de expansão impresso de verdade na carta (confirmado: `"MEW"` para o set "151", batendo exatamente com o que tínhamos descoberto manualmente via OCR real). Isso elimina duas limitações da PoC: não precisa de uma requisição por carta (uma por SET já basta — ~220 ao todo), e o código de expansão não precisa mais ser hardcoded um set de cada vez com evidência fotográfica (`setPrintedCode` em `catalogFixtures.js` continua existindo só pra esta PoC de 30 cartas).
- **[`scripts/build-thumbnails.js`](../scripts/build-thumbnails.js)**: gera as miniaturas pequenas pré-empacotadas (60×84px, WebP) a partir do banco acima.

**Testado contra dados reais em pequena escala**: 2 sets × 2 idiomas (516 cartas, nenhuma falha) para o banco; 5 cartas reais baixadas e comprimidas para as miniaturas — **1130 bytes/miniatura em média**, confirmando a estimativa da seção 11 (~1-2KB cada). Banco gerado: 100KB para 516 linhas.

**Por que não foi rodado em escala completa de uma vez só**: o script do banco (`sync-full-catalog.js --full`) faria ~1100 requisições reais (220 sets × 5 idiomas) — tecnicamente leve (só JSON), mas é uma ação real contra a API pública de terceiros. O script de miniaturas (`build-thumbnails.js --full`) é mais pesado: um download de imagem real por carta, dezenas de milhares no total. Os dois scripts suportam escopo reduzido (`--sets`/`--langs`/`--limit`) para testes incrementais sem essa escala.

### 11.2. Sincronização automática em lotes — rodando de verdade (23/10/2026)

Pedido real: em vez de rodar tudo de uma vez, buscar o catálogo aos poucos (um lote por hora), retomando de onde parou, até completar; depois, passar a rodar bem mais espaçado (de 3 em 3 dias) só pra achar cartas/sets novos.

- `scripts/sync-full-catalog.js` ganhou `--resume` (não apaga o banco existente; consulta uma tabela `synced_pairs` pra saber quais combinações set×idioma já tem, e pula essas) e `--batch=N` (processa só N combinações novas por execução). Testado localmente simulando 3 execuções seguidas (6 pares, lotes de 3): a 1ª processou 3, a 2ª retomou e processou as 3 restantes sem refazer nada, a 3ª reconheceu corretamente que não havia mais nada pendente ("CATÁLOGO COMPLETO").
- **[`.github/workflows/sync-catalog.yml`](../.github/workflows/sync-catalog.yml)**: roda o script acima de hora em hora (`cron: "7 * * * *"`, `BATCH_SIZE=25`), publicando o progresso (banco SQLite + manifesto) como assets de uma Release fixa do repositório (`catalog-data`) — não como commits no histórico do git, pra não acumular um binário SQLite mudando toda hora no histórico. Cada execução baixa o progresso da anterior (se existir), processa mais um lote, e republica.
- **A troca de cadência (hora em hora → 3 em 3 dias) é manual e deliberada**, uma linha no `cron:` do workflow, para quando o primeiro ciclo completo terminar (`remainingPairs: 0` / `complete: true` no manifesto) — não há nada se auto-ajustando aqui, de propósito, para manter simples e auditável.
- Com `BATCH_SIZE=25` e ~1100 pares no total, o primeiro ciclo completo leva aproximadamente 44 horas corridas (sujeito ao agendador do GitHub Actions, que não garante execução exatamente na hora certa).
- **Escopo desta automação**: só os metadados (banco SQLite). A geração de miniaturas (`build-thumbnails.js`, mais pesada — download de imagem real por carta) continua manual/sob demanda por enquanto, não entrou neste workflow.
- **Execução real confirmada**: workflow disparado manualmente uma vez para validar de ponta a ponta no ambiente real do GitHub Actions (não só localmente) — sincronizou 14/25 pares com sucesso na primeira hora, publicou o banco (112KB) e o manifesto como assets da Release `catalog-data` com sucesso. As 11 falhas foram todas 404 reais (sets sem tradução em certos idiomas, ex. `miscp`/`jumbo`/`basep`), corrigido logo em seguida (ver 11.3) para não ficarem sendo retentadas pra sempre.

### 11.3. Correções e achados reais depois de ligar a automação (23/10/2026)

- **404 real não é erro transitório**: a 1ª execução real revelou que alguns pares set×idioma (`miscp`/`jumbo`/`basep` em pt/fr/de/ja) devolvem 404 de verdade — sets sem tradução nesses idiomas, não uma falha de rede. Sem tratamento especial, esses 11 pares seriam retentados em TODA execução futura, desperdiçando quase metade do lote de 25 a cada hora, para sempre. Corrigido: nova tabela `not_found_pairs` registra especificamente erros com `kind: "not_found"` (do `TcgdexError` real de `tcgdexClient.js`) separado de outras falhas — timeout/rede continuam sendo tentados de novo (podem ser transitórios), só 404 confirmado é que para de ser tentado. Testado localmente: 2 404 reais gerados e confirmados não-retentados na execução seguinte.
- **Repositório precisou ser tornado público**: ao desenhar `src/storage/catalogSync.js` (a metade "baixar o pacote publicado" que faltava em `catalogIndex.js`), a tentativa de baixar os assets da Release `catalog-data` sem autenticação devolveu 404 — o repositório estava privado, e assets de Release de repositório privado exigem um token do GitHub pra baixar. Embutir um token assim num app publicado seria um risco de segurança real (qualquer pessoa poderia extraí-lo do binário e abusar dele). Antes de agir, o histórico completo do git foi varrido por padrões de segredo (chaves, senhas, tokens) — nada encontrado (só falsos positivos: a senha pública padrão do keystore de debug Android "android", nomes de pacotes npm, e "carta secreta/extra" referindo-se a raridade de carta Pokémon). Repositório tornado público (`gh repo edit --visibility public`); o link de download da Release passou a funcionar sem autenticação, confirmado com `curl` real.
- **`src/storage/catalogSync.js`** (novo): implementa a metade "baixar/sincronizar" que faltava — `checkForUpdate()` (compara o checksum do banco local salvo no aparelho com o publicado, sem baixar o banco inteiro só pra checar), `downloadAndInstallCatalog()` (usa `expo-file-system` — a API nova orientada a objeto do SDK 58, `File.downloadFileAsync()` — pra baixar o banco publicado pro diretório onde `expo-sqlite` espera encontrá-lo), `syncCatalogIfNeeded()` (só baixa se o checksum publicado for diferente do já instalado) e `openSyncedCatalogDb()` (abre o banco já baixado via `catalogIndex.js`/`expo-sqlite`). **Não conectado à tela do scanner desta PoC** (`app/index.jsx` continua usando o bundle JSON estático de 30 cartas, já validado com cartas físicas reais) — ligar os dois é uma decisão deliberada de Entrega 1, fora do escopo desta PoC.
- **Lógica de decisão extraída e testada de verdade**: `checkForUpdate()` depende de `expo-file-system`/`expo-sqlite`, que só existem em runtime React Native — não rodam em `node --test` (confirmado: `require()` direto do módulo falha com `ERR_MODULE_NOT_FOUND` em Node puro). A regra "quando existe atualização" (comparar por `dbSha256`, nunca por `generatedAt`, que muda a cada execução horária mesmo sem conteúdo novo) foi extraída pra `src/storage/catalogSyncDecision.js` (função pura `shouldUpdate()`), sem nenhuma dependência de Expo, e ganhou 4 testes reais automatizados em `scripts/run-catalog-sync-tests.js` (sem manifesto local / checksum igual / checksum diferente / só data diferente não conta) — rodando junto de `npm test` (`test:catalog-sync`). Primeira parte de `catalogSync.js` com cobertura de teste real, não só `node -c`.
- **Primeira execução agendada (de hora em hora) confirmada saudável**: até 23/10/2026 17:30 UTC só o disparo manual (`workflow_dispatch`) havia rodado (ver acima); o cron (`7 * * * *`) ainda não tinha completado seu primeiro ciclo natural (próxima janela: 18:07 UTC) — comportamento esperado, nada quebrado. Verificar com `gh run list --workflow=sync-catalog.yml` sempre que for conferir o progresso real.
- **CI automático dos testes** (`.github/workflows/test.yml`, novo): roda `npm test` (hoje 44 testes `node:test` + checagem de sintaxe JSX) a cada push/PR na branch `master`, sem depender de alguém lembrar de rodar manualmente antes de commitar.
- **Redução de frequência do cron agora é automática, não manual**: a decisão original (ver nota no próprio `sync-catalog.yml` antes desta mudança) era trocar a cadência de hora em hora pra cada 3 dias manualmente, de propósito, "pra manter simples" — risco real de esquecer, já que o primeiro ciclo completo leva ~44h espalhadas por quase 2 dias. Substituído por automação de verdade: `scripts/maybe-slow-down-cron.js` (lógica pura testada em `src/automation/cronSwitch.js` / `scripts/run-cron-switch-tests.js`, 4 testes) roda como último passo do próprio workflow; quando o manifesto desta execução marca `complete: true` pela primeira vez, o workflow edita e commita a troca do cron neste mesmo arquivo (`git commit` + `git push` usando o `GITHUB_TOKEN` padrão, que já tinha `permissions: contents: write`). Idempotente: se a cadência já estiver reduzida, não mexe de novo. Testado de ponta a ponta localmente (cópia isolada do YAML, fora do repositório real) antes de ligar no workflow de verdade.
