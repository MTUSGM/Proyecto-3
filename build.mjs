import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('./src/', import.meta.url);
const output = new URL('./public/', import.meta.url);
const replacements = {
  STYLE: 'style.css',
  MATTER: 'matter.min.js',
  PHYSICS: 'physics.js',
  APP: 'app.js',
};
let html = await readFile(new URL('index.html', source), 'utf8');
for (const [marker, file] of Object.entries(replacements)) {
  const content = await readFile(new URL(file, source), 'utf8');
  html = html.replace('/* ' + marker + ' */', () => content);
}
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
