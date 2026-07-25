import fs from "fs";
import path from "path";

const base = path.dirname(new URL(import.meta.url).pathname);
const htmlPath = path.join(base, "..", "Semana 2 - Flujos y Algoritmos.html");
const newSlidesPath = path.join(base, "semana2-new-slides.html");
const notesPath = path.join(base, "semana2-flujos-guion.json");

const html = fs.readFileSync(htmlPath, "utf8");
const newSlidesRaw = fs.readFileSync(newSlidesPath, "utf8");
const notes = JSON.parse(fs.readFileSync(notesPath, "utf8"));

const stageMatch = html.match(/<deck-stage[\s\S]*?<\/deck-stage>/);
if (!stageMatch) throw new Error("deck-stage not found");

const stageInner = stageMatch[0]
  .replace(/^<deck-stage[^>]*>/, "")
  .replace(/<\/deck-stage>$/, "");

const sectionRegex = /<section[\s\S]*?<\/section>/g;
const sections = stageInner.match(sectionRegex);
if (!sections || sections.length !== 17) {
  throw new Error(`Expected 17 sections, found ${sections?.length ?? 0}`);
}

function extractSlide(name) {
  const marker = `<!-- INSERT: ${name}`;
  const start = newSlidesRaw.indexOf(marker);
  if (start === -1) throw new Error(`Slide ${name} not found`);
  const end = newSlidesRaw.indexOf("<!-- INSERT:", start + 1);
  const chunk = end === -1 ? newSlidesRaw.slice(start) : newSlidesRaw.slice(start, end);
  const section = chunk.match(/<section[\s\S]*?<\/section>/);
  if (!section) throw new Error(`Section HTML missing for ${name}`);
  return section[0];
}

const updatedAgenda = sections[1]
  .replace("100 MIN", "90 MIN")
  .replace(
    /<div style="display: flex; flex-direction: column">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
    `<div style="display: flex; flex-direction: column">
            <div class="arow anim-up d2"><span class="arow-n">01</span><span class="arow-t">Curiosidad y beneficios</span><span class="arow-d">Actitud y proposito del curso</span><span class="arow-time">8 min</span></div>
            <div class="arow anim-up d3"><span class="arow-n">02</span><span class="arow-t">Recordatorios</span><span class="arow-d">Foto, grupos, laboratorio y foro</span><span class="arow-time">3 min</span></div>
            <div class="arow anim-up d4"><span class="arow-n">03</span><span class="arow-t">Fundamentos y arquitectura</span><span class="arow-d">Definicion, algoritmos, evolucion, Von Neumann, CPU, FDE</span><span class="arow-time">42 min</span></div>
            <div class="arow anim-up d5"><span class="arow-n">04</span><span class="arow-t">Traza, diseno y actividad</span><span class="arow-d">Demo, buenas practicas y analisis</span><span class="arow-time">20 min</span></div>
            <div class="arow anim-up d5"><span class="arow-n">05</span><span class="arow-t">Foro del curso</span><span class="arow-d">14 preguntas con respuesta</span><span class="arow-time">12 min</span></div>
            <div class="arow anim-up d5"><span class="arow-n">06</span><span class="arow-t">Grupos, cierre y tarea</span><span class="arow-d">Foto final y asignacion</span><span class="arow-time">5 min</span></div>
          </div>
        </div>
      </section>`
  );

const updatedCierre = sections[16]
  .replace('data-screen-label="Foro, cierre y tarea"', 'data-screen-label="Cierre, tarea y foto"')
  .replace("<h2 class=\"ctitle anim-up\">Foro, cierre y asignación</h2>", "<h2 class=\"ctitle anim-up\">Cierre, tarea y foto grupal</h2>")
  .replace(
    /<div class="cards3">[\s\S]*?<\/div>\s*<div class="flist[\s\S]*?<\/div>/,
    `<div class="cards3">
            <div class="qcard anim-up d2"><div class="qcard-t">Síntesis</div><div class="qcard-b">Von Neumann y el ciclo <b>FDE</b> como base del hardware moderno.</div></div>
            <div class="qcard anim-up d3"><div class="qcard-t">Tarea 1 · 7 días</div><div class="qcard-b">Investigación y esquema sobre evolución y arquitectura de la computadora.</div></div>
            <div class="qcard anim-up d4"><div class="qcard-t">Foto de cierre</div><div class="qcard-b">Jorge: tomarse foto grupal con los estudiantes antes de despedirse.</div></div>
          </div>
          <div class="flist anim-up d5" style="margin-top: 6px">
            <div class="fitem"><span class="ftick">Lab</span><span>Laboratorio los <b>sábados</b>, salón <b>214</b>.</span></div>
            <div class="fitem"><span class="ftick">Grp</span><span>Entregas en <b>equipo</b>; un envío con todos los nombres.</span></div>
          </div>`
  )
  .replace("15 MIN", "5 MIN");

const updatedActividad = sections[15].replace(
  '<span class="chip">⏱ 25 min</span><span class="chip">Individual</span>',
  '<span class="chip">6 min en sala</span><span class="chip">Grupo</span>'
);

const merged = [
  sections[0],
  updatedAgenda,
  extractSlide("recordatorios"),
  sections[2],
  extractSlide("beneficios"),
  sections[3],
  extractSlide("algoritmos"),
  sections[4],
  sections[5],
  sections[6],
  sections[7],
  sections[8],
  sections[9],
  sections[10],
  sections[11],
  sections[12],
  sections[13],
  sections[14],
  extractSlide("diseno algoritmos"),
  updatedActividad,
  extractSlide("foro I"),
  extractSlide("foro II"),
  extractSlide("foro III"),
  extractSlide("grupos"),
  updatedCierre,
];

if (merged.length !== notes.length) {
  throw new Error(`Slide count ${merged.length} != notes count ${notes.length}`);
}

const renumbered = merged.map((section, index) => {
  const label = String(index + 1).padStart(2, "0");
  return section.replace(/data-label="[^"]*"/, `data-label="${label}"`);
});

const newStage = `<deck-stage width="1920" height="1080">\n${renumbered.join("\n\n")}\n    </deck-stage>`;

const notesBlock =
  '    <script type="application/json" id="speaker-notes">\n' +
  JSON.stringify(notes, null, 2)
    .split("\n")
    .map((line) => "    " + line)
    .join("\n") +
  "\n    </script>";

let output = html.replace(/<deck-stage[\s\S]*?<\/deck-stage>/, newStage);
output = output.replace(
  /    <script type="application\/json" id="speaker-notes">[\s\S]*?    <\/script>/,
  notesBlock
);

fs.writeFileSync(htmlPath, output);
console.log(`Merged ${renumbered.length} slides and ${notes.length} speaker notes.`);
