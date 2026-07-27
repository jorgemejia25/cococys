import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const base = path.dirname(fileURLToPath(import.meta.url));
const presentations = path.join(base, "..");

/**
 * Injects a speaker-notes JSON array into a deck HTML file.
 *
 * Usage: node inject-guion.mjs [--deck=filename.html] [--json=guion.json]
 * Defaults: Semana 2 - Flujos y Algoritmos.html + semana2-flujos-guion.json
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    deck: "Semana 2 - Flujos y Algoritmos.html",
    json: "semana2-flujos-guion.json",
  };
  for (const arg of args) {
    if (arg.startsWith("--deck=")) opts.deck = arg.slice(7);
    if (arg.startsWith("--json=")) opts.json = arg.slice(7);
  }
  return opts;
}

function injectGuion(deckFile, jsonFile) {
  const htmlPath = path.join(presentations, deckFile);
  const notesPath = path.join(base, jsonFile);
  const notes = JSON.parse(fs.readFileSync(notesPath, "utf8"));

  let html = fs.readFileSync(htmlPath, "utf8");
  const block =
    '    <script type="application/json" id="speaker-notes">\n' +
    JSON.stringify(notes, null, 2)
      .split("\n")
      .map((line) => "    " + line)
      .join("\n") +
    "\n    </script>";

  if (!html.includes('id="speaker-notes"')) {
    throw new Error(`No #speaker-notes block in ${deckFile}`);
  }

  html = html.replace(
    /    <script type="application\/json" id="speaker-notes">[\s\S]*?    <\/script>/,
    block
  );

  fs.writeFileSync(htmlPath, html);
  console.log(`Injected ${notes.length} notes into ${deckFile}`);
}

const { deck, json } = parseArgs();
injectGuion(deck, json);
