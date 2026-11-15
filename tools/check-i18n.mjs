// Checks that en/si/ta have the same keys and that every key used in the code exists.
// Usage: node tools/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (l) => (await import(`../js/i18n/${l}.js`)).default;
const dicts = { en: await load('en'), si: await load('si'), ta: await load('ta') };
let problems = 0;
const report = (msg) => { problems++; console.log('✗', msg); };

const enKeys = new Set(Object.keys(dicts.en));
for (const l of ['si', 'ta']) {
  const keys = new Set(Object.keys(dicts[l]));
  enKeys.forEach((k) => { if (!keys.has(k)) report(`${l}: missing "${k}"`); });
  keys.forEach((k) => { if (!enKeys.has(k)) report(`${l}: extra "${k}"`); });
  // Placeholders must match.
  enKeys.forEach((k) => {
    const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
    if (keys.has(k) && ph(dicts.en[k]) !== ph(dicts[l][k])) report(`${l}: placeholders differ for "${k}"`);
  });
}

// Keys used literally in code.
const files = [];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory() && e.name !== 'i18n') walk(p);
  else if (e.name.endsWith('.js')) files.push(p);
});
walk(path.join(root, 'js'));
files.forEach((f) => {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('([A-Za-z0-9_.%]+)'/g)) {
    if (m[1].endsWith('.')) continue;
    if (!enKeys.has(m[1])) report(`${path.basename(f)}: unknown key "${m[1]}"`);
  }
  for (const m of src.matchAll(/label: '([a-z]+\.[A-Za-z.]+)'/g)) {
    if (!enKeys.has(m[1])) report(`${path.basename(f)}: unknown key "${m[1]}"`);
  }
});

// Dynamic key families.
const families = {
  day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  gender: ['M', 'F'],
  status: ['Active', 'Left', 'Graduated'],
  rel: ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Guardian', 'Other'],
  etype: ['Debate', 'TalentShow', 'Meditation', 'PrefectProgram', 'Sports', 'Quiz', 'Essay', 'Art', 'Other'],
  role: ['HeadPrefect', 'DeputyHeadPrefect', 'SeniorPrefect', 'Prefect', 'JuniorPrefect', 'ClassMonitor', 'Other'],
  'filter.prefect': ['current', 'past', 'ever', 'never'],
  'filter.sort': ['name', 'regNo', 'grade', 'age', 'att', 'recent'],
  'profile.tab': ['details', 'attendance', 'exams', 'events', 'prefect', 'grades'],
  'events.placeN': ['1', '2', '3'],
  csv: ['RegNo', 'FullName', 'NameWithInitials', 'Gender', 'Birthday', 'Age', 'Grade', 'Telephone', 'Address', 'GuardianName',
    'GuardianRelationship', 'GuardianPhone', 'AdmissionDate', 'Status', 'Attendance%', 'Prefect']
};
Object.entries(families).forEach(([p, vals]) => vals.forEach((v) => { if (!enKeys.has(`${p}.${v}`)) report(`missing "${p}.${v}"`); }));

// Every error code the backend can produce must be translated.
const backend = readFileSync(path.join(root, 'backend', 'Code.js'), 'utf8');
const codes = new Set();
for (const m of backend.matchAll(/(?:fail_\(|: ')([A-Z][A-Z_]{3,})['(:]/g)) codes.add(m[1]);
for (const m of backend.matchAll(/'([A-Z][A-Z_]{3,})'/g)) codes.add(m[1]);
['SHA_256', 'UTF_8', 'USER_DEPLOYING', 'ANYONE_ANONYMOUS', 'REGISTRY_ID', 'JSON'].forEach((c) => codes.delete(c));
codes.forEach((c) => { if (!enKeys.has('err.' + c)) report(`backend code "${c}" has no err.${c} translation`); });

if (problems) { console.log(`\n${problems} i18n problem(s).`); process.exit(1); }
console.log(`i18n ok: ${enKeys.size} keys in en/si/ta; ${codes.size} backend error codes translated.`);
