# Capturas de tela reais — Entrega 1

Capturas reais enviadas pelo usuário durante o teste no dispositivo físico
(25/10/2026, ~13h), **não geradas nem simuladas**. Mostram o erro real
documentado em `reports/decision.md`, seção 11.6 (diretório `SQLite/`
inexistente em instalação nova do app), que foi corrigido na mesma sessão.

Não há capturas do estado já corrigido: o usuário confirmou os testes
posteriores (sincronização do catálogo, scanner, busca manual, modo avião)
por texto, sem reenviar prints. Documentar isso aqui em vez de criar uma
imagem "depois" fictícia, conforme a exigência da especificação de não
apresentar imagens demonstrativas como se fossem capturas reais.

- **01-erro-sync-catalogo-tela.jpg** — tela inicial do DexBinder parada em
  "Verificando catálogo...", com o banner de erro do Expo Dev Client visível
  no rodapé ("Uncaught (in promise, id: 6)...").
- **02-erro-sync-catalogo-console.jpg** — detalhe do erro no console do Expo:
  `java.lang.IllegalArgumentException: URI is not absolute`, causado por usar
  `defaultDatabaseDirectory` (caminho puro) diretamente como URI de arquivo.
- **03-erro-sync-catalogo-banner.jpg** — banner de erro definitivo exibido
  pelo app (`CatalogStatusBanner`) após a falha: "Não foi possível preparar o
  catálogo (...) java.io.FileNotFoundException: (...) SQLite/
  dexbinder_catalog.download.db: open failed: ENOENT (No such file or
  directory)", com botão "Tentar de novo".

Ambos os bugs (URI relativo e diretório `SQLite/` ausente) foram corrigidos
em `src/storage/catalogSync.js` — ver `reports/decision.md`, seção 11.6, e
`reports/delivery-1.md`, item 3.6/3.7.
