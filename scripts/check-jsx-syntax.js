/**
 * Checagem estática de sintaxe JSX/JS dos arquivos do app, sem precisar
 * instalar o Expo/React Native inteiro. Usa @babel/parser (devDependency).
 *
 * Uso: node scripts/check-jsx-syntax.js
 */

const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");

const FILES_TO_CHECK = [
  path.join(__dirname, "..", "App.js"),
  path.join(__dirname, "..", "app", "index.jsx"),
  path.join(__dirname, "..", "app", "theme.js"),
  path.join(__dirname, "..", "app", "Navigation.jsx"),
  path.join(__dirname, "..", "app", "components", "AppButton.jsx"),
  path.join(__dirname, "..", "app", "components", "CatalogStatusBanner.jsx"),
  path.join(__dirname, "..", "app", "components", "ScreenHeader.jsx"),
  path.join(__dirname, "..", "app", "screens", "HomeScreen.jsx"),
  path.join(__dirname, "..", "app", "screens", "FichariosScreen.jsx"),
  path.join(__dirname, "..", "app", "screens", "PokedexScreen.jsx"),
  path.join(__dirname, "..", "app", "screens", "InventarioScreen.jsx"),
];

let hadError = false;

for (const file of FILES_TO_CHECK) {
  const code = fs.readFileSync(file, "utf8");
  try {
    parse(code, { sourceType: "module", plugins: ["jsx"] });
    console.log(`OK: ${path.relative(process.cwd(), file)}`);
  } catch (e) {
    hadError = true;
    console.log(`FALHOU: ${path.relative(process.cwd(), file)}`);
    console.log(`  ${e.message}`);
  }
}

process.exit(hadError ? 1 : 0);
