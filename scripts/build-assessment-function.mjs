import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = new URL('../functions/src/assessment/', import.meta.url);
const destination = new URL('../functions-assessment/generated/', import.meta.url);
const files = ['model.js', 'service.js', 'firestore-repository.js', 'callable-handler.js'];
const check = process.argv.includes('--check');
if (!check) mkdirSync(destination, { recursive: true });
for (const file of files) {
  const bytes = readFileSync(new URL(file, source)), target = new URL(file, destination);
  if (check) {
    if (!readFileSync(target).equals(bytes)) throw new Error('Assessment function source is stale: ' + file);
  } else writeFileSync(target, bytes);
}
console.log(check ? 'Four packaged assessment modules match canonical source.' : 'Prepared four canonical assessment modules in ' + fileURLToPath(destination));
