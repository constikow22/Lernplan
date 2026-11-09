import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { validateRelations, validateRetainedIds } from '../js/data.js';

const schemaFile = new URL('../data/lerneinheiten.schema.json', import.meta.url);
const dataFile = new URL('../data/lerneinheiten.json', import.meta.url);
const previousFile = process.argv[2];
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

try {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(await readJson(schemaFile));
  const data = await readJson(dataFile);
  if (!validate(data)) throw new Error(ajv.errorsText(validate.errors, { separator: '\n' }));
  validateRelations(data);
  if (previousFile) validateRetainedIds(await readJson(previousFile), data);
  const literatureCount = data.units.reduce((sum, unit) => sum + unit.literature.length, 0);
  console.log(`Gültig: ${data.units.length} Lerneinheiten, ${literatureCount} Literatur- und Fallpositionen, ${data.weeks.length} Lernwochen.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
