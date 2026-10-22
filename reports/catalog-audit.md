# Auditoria real do catálogo TCGdex — Entrega 0 / PoC A

**Execução real em:** 2026-10-22, 11:06–11:07 UTC
**Endpoint base:** `https://api.tcgdex.net/v2`
**Método:** consultas HTTP reais (`fetch` em Node 22, sem mocks) a `GET /{lang}/cards/{id}`, respostas salvas integralmente em [`fixtures/cards/`](../fixtures/cards) e tabuladas em [`reports/catalog-audit-table.csv`](catalog-audit-table.csv) / [`reports/catalog-audit-raw.json`](catalog-audit-raw.json).
**Script usado:** [`scripts/run-catalog-audit.js`](../scripts/run-catalog-audit.js) — reexecutável com `node scripts/run-catalog-audit.js`.
**Amostra:** 31 impressões/registros consultados (acima do mínimo de 30 exigido pela especificação), cobrindo todos os casos da matriz da seção 16.1. **31 de 31 consultas retornaram HTTP 200** — nenhum 404/timeout nesta rodada, mas isso não significa que a cobertura de dados dentro de cada resposta seja completa (ver seção "Lacunas e inconsistências" abaixo).

> Nenhuma credencial, token ou segredo foi necessário para estas consultas (API pública, sem autenticação). Nenhum fixture contém dados sensíveis.

## 1. O que foi verificado, por caso da matriz mínima

| Caso da matriz (seção 16.1) | Registro(s) real(is) usado(s) | Resultado |
|---|---|---|
| Carta Pokémon comum de expansão recente | `en 30th-005` (Tropius, set **30th Celebration**, lançado 2026-09-16 — a expansão física mais recente encontrada na API no momento do teste) | OK, mas **sem `dexId`** (ver achado 3) |
| Carta da expansão Escarlate e Violeta — 151 | `en/pt/de/fr sv03.5-001` (Bulbasaur) | OK — confirma `localId "001"`, `set.id "sv03.5"`, `official 165 / total 207`, exatamente como citado no wireframe da seção 8.5 da especificação |
| Mesmo Pokémon em duas/três impressões | `base1-58` (Pikachu, Base Set 1999), `sv03.5-025` (Pikachu, 151 moderno), `sv03.5-173` (Pikachu, 151, illustration rare) | OK — 3 impressões distintas, 3 `id` distintos, mesma espécie (`dexId: 25`) |
| Carta promocional | `en/fr svp-004` (Mimikyu ex) | OK |
| Variante normal + reverse/holo | `sv03.5-001` (normal+reverse), `sv03.5-003` Venusaur ex (holo/ex) | OK, com ressalva importante (achado 1) |
| Carta além da contagem oficial | `sv03.5-165` (nº 165, última "oficial"), `sv03.5-166` (nº 166, primeira "extra"), `sv03.5-180`, `sv03.5-206/207` | OK — fronteira oficial/total confirmada na prática |
| Carta Trainer e carta Energy | `sv03.5-165`/`sv03.5-206` (Trainer), `sv03.5-207` (Energy) | OK — ambas **sem `dexId`**, como esperado |
| Carta com múltiplas espécies | `sm9-33` (Pikachu & Zekrom GX, `dexId:[25,644]`), `sm12-143` (Togepi & Cleffa & Igglybuff GX, `dexId:[173,174,175]`) | OK — array `dexId` funciona corretamente para 2 e 3 espécies |
| Carta em português e inglês | `pt/en sv03.5-001`, `pt/en sv03.5-003` | OK — mesmo `id`, nomes localizados corretos (ex.: "Bulbasaur"/"Bulbasaur", "Venusaur ex"/"Venusaur ex", mas "Common"/"Comum", "Double rare"/"Rara Dupla") |
| Carta japonesa | `ja SV2a-001`, `ja SV2a-025` | OK, com achado crítico de identidade (achado 2) |
| `localId` não numérico/atípico | `dpp-DP01`, `swshp-SWSH001`, `swsh12.5gg-GG01`, `cel25-2` | OK — confirmado: formatos variam entre dígitos simples, zero-padded, letras+números e sem padding (achado 4) |
| Registro sem imagem/incompleto | `2011bw-1` (Snivy, McDonald's 2011), `swsh12.5gg-GG01` (Hisuian Voltorb) | **Confirmado**: campo `image` ausente nos dois; URL de imagem convencional retorna 404 real (achado 5) |

Bônus além do mínimo: comparação `de`/`fr` do mesmo card; cartas vintage (`neo1-1`, `gym1-1`, `xy1-1`) para profundidade histórica; e uma carta do **Pokémon TCG Pocket** (`B2-001`) para testar a fronteira entre o TCG físico e o jogo digital.

## 2. Achados críticos (evidência real, não hipotética)

### Achado 1 — `variantId` não é um identificador estável e às vezes é um placeholder literal
Ao inspecionar `variants_detailed`, dois comportamentos problemáticos foram confirmados:
- Em `30th-005`, `sm9-33`, `sm12-143`, `xy1-1` e `B2-001`, o único variante retornado tem `"variantId": "generated"` **literal** — a própria API usa essa string fixa quando não tem um identificador real de produto (ex.: sem cruzamento com Cardmarket/TCGplayer). Ou seja, `"generated"` não identifica nada: todas essas cartas comparariam como "a mesma variante" se usássemos `variantId` como chave.
- Em `sv03.5-001` (inglês) e `SV2a-001` (japonês) — **duas cartas de catálogos de idiomas e sets diferentes** — o variante "normal" tem exatamente o mesmo `variantId`: `endfynwn4n10gzq`. O mesmo ocorre entre `sv03.5-025` (en) e `SV2a-025` (ja). Isso confirma, com dados reais, o alerta da seção 16.1 da especificação: **nunca usar `variantId` como chave de identidade de impressão.** A chave interna deve ser derivada de `(provider, idioma, card id, set id, localId)`.

### Achado 2 — o mesmo "set conceitual" tem `id` totalmente diferente por idioma, e a contagem de cartas também difere
A expansão "151" é `sv03.5` em inglês/pt/fr/de (**207 cartas, 165 oficiais**) mas `SV2a` em japonês (**210 cartas, 165 oficiais** — mesma contagem oficial, total diferente). Não há nenhum campo na resposta que ligue `sv03.5` a `SV2a` como "o mesmo set em outro idioma" — a ligação teria que ser mantida manualmente pela nossa camada de catálogo. Da mesma forma, `svp` (promos SV) tem `official 225 / total 226` em inglês mas `official 225 / total 225` em francês — a cobertura por idioma realmente diverge, como a documentação do TCGdex avisa.

### Achado 3 — nem toda carta "Pokémon" tem `dexId`, mesmo sem ser Trainer/Energy
`30th-005` (Tropius) é categoria `"Pokemon"` mas não trouxe `dexId` nesta consulta. Isso significa que o pipeline de associação carta→espécie **precisa tratar `dexId` ausente como estado explícito** ("associação pendente de revisão manual"), e não presumir que toda carta de categoria Pokémon virá com a espécie resolvida automaticamente — exatamente a cautela pedida na seção 14.3, item 4 da especificação.

### Achado 4 — `localId` tem pelo menos quatro formatos distintos observados
- Zero-padded numérico: `"001"`, `"003"` (sv03.5, swsh9)
- Numérico sem padding: `"1"`, `"2"` (neo1, gym1, xy1, cel25, 2011bw)
- Prefixo de era + número: `"DP01"`, `"SWSH001"` (promos)
- Prefixo de subset: `"GG01"` (Galarian Gallery)

Todos vieram como `string` no JSON (nunca número), confirmando a orientação de nunca convertê-los para inteiro. Qualquer ordenação de página por número de colecionador precisa de uma função de ordenação "natural" (numérica quando possível, textual como fallback), não um `ORDER BY` numérico ingênuo.

### Achado 5 — "sem imagem" é um caso real, não teórico, e a URL de imagem precisa de sufixo
Em `2011bw-1` e `swsh12.5gg-GG01`, o campo `image` está ausente da resposta, **e** a URL convencional (`.../high.webp`) para esses dois casos retorna HTTP 404 de fato — não há imagem alternativa escondida. Em contraste, para cartas com `image` presente (ex.: `sv03.5-001`), tanto `.../high.webp` quanto `.../low.webp` retornaram HTTP 200 reais. Confirma-se também que o campo `image` documentado é só a **base** da URL: é obrigatório concatenar qualidade+extensão (`/high.webp`, `/low.webp`, etc.) para obter um asset real.

### Achado 6 — o catálogo de cartas mistura Pokémon TCG (físico) com Pokémon TCG Pocket (jogo digital) sob a mesma API, e a resposta de carta isolada NÃO identifica isso
A série `tcgp` ("Pokémon TCG Pocket") aparece na listagem de séries junto com `sv`, `swsh`, `me` etc. Uma carta de exemplo (`B2-001`, "Ledyba") tem raridade `"One Diamond"` — um valor que **não existe no TCG físico** (confirmado pela lista real de `rarities`, que mistura raridades físicas como "Illustration rare" com raridades exclusivas do Pocket como "One Diamond", "Four Diamond", "One Star" etc., todas no mesmo endpoint `/rarities`, sem separação por produto).

**Achado adicional, descoberto ao montar o índice local da PoC B:** o campo `set` embutido na resposta de `GET /{lang}/cards/{id}` **não traz `serie`** (confirmado inspecionando `fixtures/cards/B2-001_en.json`: `set` só tem `id`, `name`, `logo`, `symbol`, `cardCount` — sem `serie`). A informação de série só vem de `GET /{lang}/sets/{setId}` ou `GET /{lang}/series`. **Risco concreto e agora confirmado:** um `CatalogProvider` que só consulta cartas individuais (como faz a maior parte do pipeline de busca/scanner) não tem, por si só, como saber que uma carta pertence ao TCG Pocket — é obrigatório manter uma tabela de referência `set_id → serie_id` (sincronizada a partir de `/series` ou `/sets`) e usá-la para filtrar, em vez de confiar em qualquer campo da resposta de carta isolada.

### Achado 7 — não existe endpoint de lista de espécies/Pokédex no TCGdex
Testados e confirmados como inexistentes: `/pokemons`, `/pokemon`, `/dex` (todos HTTP 404). O TCGdex só expõe `cards`, `sets`, `series`, `rarities`, `categories`, `types`, `regulation-marks`. **Confirma-se de forma prática** o que a especificação já advertia na seção 14.6: a meta de 1.025 espécies da Pokédex nacional **precisa vir de uma fonte própria e validada separadamente** (ex.: lista estática curada ou outra API especializada), nunca derivada apenas dos `dexId` vistos em cartas — cartas cobrem só os Pokémon que tiveram carta impressa, na numeração que a carta decidir citar.

## 3. O que funcionou como esperado (sem drama)
- `id`, `localId`, `name`, `category`, `set.id/name/cardCount`, `variants` (booleanos simples) e `image` (quando presente) vieram consistentes e bem tipados em todos os 31 registros.
- `dexId` sempre veio como array (mesmo com um único elemento), o que simplifica o modelo `card_species` N:N proposto na seção 14.3.
- Trainer e Energy nunca trazem `dexId` — nenhuma inferência indevida observada.
- Localização pt/fr/de funcionou sem erro para todos os `id` testados nesses idiomas.

## 4. Lacunas não investigadas nesta rodada (fora do escopo de 31 amostras)
- Não foi possível validar a lista completa de 1 a 1.025 espécies (exigiria endpoint próprio, não avaliado aqui — ver achado 7).
- Não testamos paginação/rate limit da listagem completa de cartas (só endpoints de carta única e listas de sets/séries/rarities/categories).
- Cobertura de idiomas asiáticos além do japonês (coreano, chinês) não foi testada — `ko`/`zh-tw`/`zh-cn` retornaram 404 nos sets testados, mas não foi feita uma busca exaustiva por sets específicos desses idiomas.
- Direitos de imagem e uso comercial continuam pendentes (ver seção 15 da especificação) — esta auditoria é só técnica, não jurídica.

## 5. Recomendação

| Área | Evidência | Resultado |
|---|---|---|
| Cobertura de dados de carta | 31/31 consultas OK, campos centrais consistentes | **GO** |
| Identidade de impressão entre idiomas | `variantId` não confiável (achado 1); `set.id` não compartilhado entre idiomas (achado 2) | **GO COM LIMITAÇÕES** — exige chave interna própria, nunca usar `variantId`/`set.id` isolado como PK |
| Associação carta→Pokémon (`dexId`) | Funciona para 1..N espécies, mas pode faltar mesmo em cartas Pokémon (achado 3) | **GO COM LIMITAÇÕES** — tratar ausência como estado explícito, nunca bloqueante |
| Meta de 1.025 espécies | Sem endpoint próprio no TCGdex (achado 7) | **NO-GO para esta fonte isolada** — precisa de lista de espécies separada e validada |
| Separação TCG físico vs. TCG Pocket | Confirmado que convivem na mesma API (achado 6) | **GO COM LIMITAÇÕES** — obrigatório filtrar por série no `CatalogProvider` |
| Imagens | Ausência real confirmada e tratável com fallback (achado 5) | **GO** |

**Veredito consolidado da PoC A: GO COM LIMITAÇÕES.** O TCGdex é viável como fonte inicial de cartas/expansões, desde que: (1) a identidade interna de impressão nunca dependa de `variantId` nem assuma que `set.id` é igual entre idiomas; (2) a meta de 1.025 espécies venha de uma fonte própria; (3) o `CatalogProvider` filtre explicitamente a série `tcgp` (e qualquer série digital futura) para não misturar produtos físicos e digitais; (4) ausência de `dexId`/`image` seja um estado de UI tratado, não uma falha.

## 6. Campos internos a preservar (para não depender de uma única API)
Conforme seção 14.3/16.1 da especificação, e confirmado pelos achados acima, manter no mínimo por impressão: `provider`, `provider_language`, `external_card_id` (o `id` bruto do provider), `external_set_id`, `local_id` (como texto), `name_by_language`, `dex_ids` (array), `category`, `image_base_url` (sem presumir sufixo), `last_synced_at`. Nunca usar `variantId` do provider como chave primária interna; se necessário, guardá-lo apenas como metadado auxiliar de depuração.
