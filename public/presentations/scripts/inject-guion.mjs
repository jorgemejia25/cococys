import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const base = path.dirname(fileURLToPath(import.meta.url));
const presentations = path.join(base, "..");

/**
 * Injects a speaker-notes JSON array into a deck HTML file.
 *
 * @param {string} deckFile - Filename under public/presentations/
 * @param {string} jsonFile - Filename under public/presentations/scripts/
 */
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

injectGuion("Semana 2 - Flujos y Algoritmos.html", "semana2-flujos-guion.json");
