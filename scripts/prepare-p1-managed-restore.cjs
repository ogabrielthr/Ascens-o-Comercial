// Mechanical split of a pg_dump schema for an isolated restore only.
// Auth/Storage triggers and policies can reference app_private functions.
// Keep the original backup untouched; restore head, public, then tail.
const fs = require('node:fs');
const path = require('node:path');
const folder = process.argv[2];
if (!folder) throw new Error('Provide the protected backup directory.');
const source = fs.readFileSync(path.join(folder, 'managed-schema.sql'), 'utf8');
const boundary = source.search(/^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER\s/m);
if (boundary < 0 || !source.includes('CREATE TABLE')) throw new Error('Unexpected pg_dump structure.');
for (const [name, content] of [
  ['managed-head.sql', source.slice(0, boundary)],
  ['managed-tail.sql', source.slice(boundary)],
]) fs.writeFileSync(path.join(folder, name), content, { flag: 'wx' });
console.log('Prepared managed-head.sql and managed-tail.sql; original dump unchanged.');
