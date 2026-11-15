// Runs backend/Code.js against the Apps Script mock and checks the main flows.
// Usage: node tools/test-backend.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { installGasMock } from '../js/demo/gas-mock.js';

installGasMock();
const code = readFileSync(fileURLToPath(new URL('../backend/Code.js', import.meta.url)), 'utf8');
vm.runInThisContext(code, { filename: 'Code.js' });

const call = (action, data = {}, token) => globalThis.handleRequest_({ action, data, token });
const ok = (res) => { assert.equal(res.ok, true, JSON.stringify(res)); return res.data; };
const err = (res, code) => { assert.equal(res.ok, false, 'expected failure'); assert.equal(res.code, code, JSON.stringify(res)); return res; };

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const year = today.slice(0, 4);

const school = {
  schoolName: 'Sri Bodhi Dhamma School', address: 'Colombo', username: 'Bodhi', password: 'secret123',
  workingDays: ['Sun'], grades: ['Grade 1', 'Grade 2', 'Grade 3'], subjects: ['Buddha Charithaya', 'Pali', 'Dhamma']
};
let token;

test('register validates input', () => {
  const r = err(call('register', { ...school, username: 'a', password: '123', grades: [], workingDays: [] }), 'VALIDATION');
  assert.equal(r.extra.fields.username, 'USERNAME_INVALID');
  assert.equal(r.extra.fields.password, 'PASSWORD_SHORT');
  assert.equal(r.extra.fields.grades, 'LIST_REQUIRED');
  assert.equal(r.extra.fields.workingDays, 'LIST_REQUIRED');
  const d = err(call('register', { ...school, grades: ['A', 'a'] }), 'VALIDATION');
  assert.equal(d.extra.fields.grades, 'DUPLICATE');
});

test('register creates school spreadsheet', () => {
  const d = ok(call('register', school));
  token = d.token;
  assert.equal(d.school.username, 'bodhi');
  err(call('register', school), 'VALIDATION');
});

test('login / wrong password / lockout', () => {
  err(call('login', { username: 'bodhi', password: 'nope' }), 'LOGIN_INVALID');
  const d = ok(call('login', { username: 'BODHI', password: 'secret123' }));
  assert.ok(d.token);
  for (let i = 0; i < 5; i++) call('login', { username: 'x', password: 'y' });
  err(call('login', { username: 'x', password: 'y' }), 'TOO_MANY_ATTEMPTS');
  err(call('load', {}, 'bad-token'), 'SESSION_EXPIRED');
  err(call('load', {}), 'AUTH_REQUIRED');
});

test('load returns settings', () => {
  const d = ok(call('load', {}, token));
  assert.deepEqual(d.settings.grades, school.grades);
  assert.deepEqual(d.settings.workingDays, ['Sun']);
  assert.equal(d.students.length, 0);
});

const student = (over = {}) => ({
  regNo: 'ds/001', fullName: 'Kasun Perera', gender: 'M', birthday: '2014-05-02', grade: 'Grade 1',
  telephone: '077 123 4567', guardianName: 'Nimal Perera', guardianRelationship: 'Father', guardianPhone: '+94771234567', ...over
});

test('student validation', () => {
  const r = err(call('saveStudent', { isNew: true, student: student({ birthday: '2100-01-01', guardianPhone: '123', grade: 'Grade 9' }) }, token), 'VALIDATION');
  assert.equal(r.extra.fields.birthday, 'DATE_FUTURE');
  assert.equal(r.extra.fields.guardianPhone, 'PHONE_INVALID');
  assert.equal(r.extra.fields.grade, 'GRADE_INVALID');
});

test('add students, duplicates rejected, phones normalised', () => {
  const s = ok(call('saveStudent', { isNew: true, student: student() }, token)).student;
  assert.equal(s.regNo, 'DS/001');
  assert.equal(s.telephone, '0771234567');
  assert.equal(s.guardianPhone, '0771234567');
  assert.equal(s.status, 'Active');
  const r = err(call('saveStudent', { isNew: true, student: student() }, token), 'VALIDATION');
  assert.equal(r.extra.fields.regNo, 'REGNO_EXISTS');
  ok(call('saveStudent', { isNew: true, student: student({ regNo: 'DS/002', fullName: 'Amaya Silva', gender: 'F' }) }, token));
  ok(call('saveStudent', { isNew: true, student: student({ regNo: 'DS/003', fullName: 'Dinuka Fernando', grade: 'Grade 2' }) }, token));
});

test('attendance save / read / summary / report', () => {
  const a = ok(call('getAttendance', { grade: 'Grade 1', date: today }, token));
  assert.equal(a.students.length, 2);
  assert.equal(a.saved, false);
  ok(call('saveAttendance', { grade: 'Grade 1', date: today, records: { 'DS/001': 'P', 'DS/002': 'A' } }, token));
  ok(call('saveAttendance', { grade: 'Grade 1', date: `${year}-01-05`, records: { 'DS/001': 'P', 'DS/002': 'P' } }, token));
  const b = ok(call('getAttendance', { grade: 'Grade 1', date: today }, token));
  assert.equal(b.saved, true);
  assert.equal(b.students.find((s) => s.regNo === 'DS/002').status, 'A');
  const load = ok(call('load', {}, token));
  assert.deepEqual(load.attendance.byStudent['DS/001'], { p: 2, a: 0 });
  assert.deepEqual(load.attendance.byStudent['DS/002'], { p: 1, a: 1 });
  assert.equal(load.attendance.lastByGrade['Grade 1'].date, today);
  const rep = ok(call('attendanceReport', { grade: 'Grade 1', month: `${year}-01` }, token));
  assert.deepEqual(rep.dates, [`${year}-01-05`]);
  err(call('saveAttendance', { grade: 'Grade 1', date: '2999-01-01', records: { 'DS/001': 'P' } }, token), 'VALIDATION');
  ok(call('deleteAttendance', { grade: 'Grade 1', date: `${year}-01-05` }, token));
  const load2 = ok(call('load', {}, token));
  assert.deepEqual(load2.attendance.byStudent['DS/001'], { p: 1, a: 0 });
});

let examId;
test('exams and marks', () => {
  const v = err(call('saveExam', { exam: { name: '', grade: 'Grade 1', year: '20', subjects: [], maxMarks: '5000' } }, token), 'VALIDATION');
  assert.deepEqual(Object.keys(v.extra.fields).sort(), ['maxMarks', 'name', 'subjects', 'year']);
  const ex = ok(call('saveExam', { exam: { name: 'Term 1 test', grade: 'Grade 1', year, term: '1', subjects: ['Pali', 'Dhamma'], maxMarks: 100 } }, token)).exam;
  examId = ex.examId;
  assert.deepEqual(ex.subjects, ['Pali', 'Dhamma']);
  const bad = err(call('saveExamMarks', { examId, subject: 'Pali', entries: [{ regNo: 'DS/001', marks: '150' }, { regNo: 'DS/002', marks: 'abc' }] }, token), 'VALIDATION');
  assert.equal(bad.extra.fields['marks_DS/001'], 'MARKS_RANGE');
  assert.equal(bad.extra.fields['marks_DS/002'], 'NUMBER_INVALID');
  ok(call('saveExamMarks', { examId, subject: 'Pali', entries: [{ regNo: 'DS/001', marks: '80' }, { regNo: 'DS/002', marks: '90' }] }, token));
  ok(call('saveExamMarks', { examId, subject: 'Dhamma', entries: [{ regNo: 'DS/001', marks: '70' }, { regNo: 'DS/002', absent: true }] }, token));
  const m = ok(call('getExamMarks', { examId }, token));
  assert.equal(m.marks.length, 4);
  assert.equal(m.students.length, 2);
  // re-saving replaces
  ok(call('saveExamMarks', { examId, subject: 'Pali', entries: [{ regNo: 'DS/001', marks: '85' }, { regNo: 'DS/002', marks: '' }] }, token));
  const m2 = ok(call('getExamMarks', { examId }, token));
  assert.equal(m2.marks.filter((x) => x.subject === 'Pali').length, 1);
});

let eventId;
test('events and marks', () => {
  const ev = ok(call('saveEvent', { event: { name: 'Vesak debate', type: 'Debate', date: today, grades: ['Grade 1'], maxMarks: '50' } }, token)).event;
  eventId = ev.eventId;
  err(call('saveEventMarks', { eventId, entries: [{ regNo: 'DS/001', marks: '60' }] }, token), 'VALIDATION');
  ok(call('saveEventMarks', { eventId, entries: [{ regNo: 'DS/001', marks: '45', place: '1st', remarks: 'Excellent' }, { regNo: 'DS/003', marks: '30' }] }, token));
  const r = ok(call('getEventMarks', { eventId }, token));
  assert.equal(r.entries.length, 2);
  err(call('saveEvent', { event: { name: 'X', type: 'Nope', date: 'bad' } }, token), 'VALIDATION');
});

test('prefects', () => {
  const p = ok(call('savePrefect', { prefect: { regNo: 'DS/001', role: 'Prefect', startDate: `${year}-01-01` } }, token)).prefect;
  const c = err(call('savePrefect', { prefect: { regNo: 'DS/001', role: 'Prefect', startDate: `${year}-02-01` } }, token), 'VALIDATION');
  assert.equal(c.extra.fields.role, 'PREFECT_ALREADY_ACTIVE');
  const e2 = err(call('savePrefect', { prefect: { ...p, endDate: '2000-01-01' } }, token), 'VALIDATION');
  assert.equal(e2.extra.fields.endDate, 'END_BEFORE_START');
  ok(call('savePrefect', { prefect: { ...p, endDate: today } }, token));
});

test('student history', () => {
  const h = ok(call('studentHistory', { regNo: 'DS/001' }, token));
  assert.equal(h.attendance.length, 1);
  assert.equal(h.exams.length, 1);
  assert.equal(h.exams[0].total, 155);
  assert.equal(h.exams[0].rank, 1);
  assert.equal(h.events[0].place, '1st');
  assert.equal(h.prefects.length, 1);
  assert.equal(h.gradeHistory.length, 1);
});

test('move / promote students keeps grade history', () => {
  ok(call('moveStudents', { regNos: ['DS/001', 'DS/002'], toGrade: 'Grade 2' }, token));
  const h = ok(call('studentHistory', { regNo: 'DS/001' }, token));
  assert.equal(h.gradeHistory.length, 2);
  assert.equal(h.gradeHistory.filter((x) => !x.toDate)[0].grade, 'Grade 2');
  // old attendance still visible under Grade 1
  assert.equal(h.attendance[0].grade, 'Grade 1');
  ok(call('moveStudents', { regNos: ['DS/003'], toGrade: '@Graduated' }, token));
  const load = ok(call('load', {}, token));
  assert.equal(load.students.find((s) => s.regNo === 'DS/003').status, 'Graduated');
});

test('settings: remove grade blocked while students active, rename works', () => {
  const s = ok(call('load', {}, token)).settings;
  const r = err(call('saveSettings', { ...s, grades: ['Grade 1', 'Grade 3'] }, token), 'VALIDATION');
  assert.match(r.extra.fields.grades, /^GRADE_HAS_STUDENTS:Grade 2/);
  ok(call('saveSettings', { ...s, grades: [...s.grades, 'Grade 4'], workingDays: ['Sat', 'Sun'] }, token));
  ok(call('renameGrade', { from: 'Grade 2', to: 'Grade Two' }, token));
  const l = ok(call('load', {}, token));
  assert.ok(l.settings.grades.includes('Grade Two'));
  assert.equal(l.students.find((x) => x.regNo === 'DS/001').grade, 'Grade Two');
  ok(call('getAttendance', { grade: 'Grade 4', date: today }, token));
});

test('change password signs out other sessions', () => {
  const other = ok(call('login', { username: 'bodhi', password: 'secret123' })).token;
  const w = err(call('changePassword', { currentPassword: 'wrong', newPassword: 'newsecret1' }, token), 'VALIDATION');
  assert.equal(w.extra.fields.currentPassword, 'PASSWORD_WRONG');
  ok(call('changePassword', { currentPassword: 'secret123', newPassword: 'newsecret1' }, token));
  err(call('load', {}, other), 'SESSION_EXPIRED');
  ok(call('load', {}, token));
  ok(call('login', { username: 'bodhi', password: 'newsecret1' }));
});

test('delete student removes all records', () => {
  ok(call('deleteStudent', { regNo: 'DS/001' }, token));
  err(call('studentHistory', { regNo: 'DS/001' }, token), 'STUDENT_NOT_FOUND');
  const l = ok(call('load', {}, token));
  assert.equal(l.eventMarks.filter((m) => m.regNo === 'DS/001').length, 0);
  assert.equal(l.prefects.length, 0);
  ok(call('deleteExam', { examId }, token));
  ok(call('deleteEvent', { eventId }, token));
});

test('logout', () => {
  ok(call('logout', {}, token));
  err(call('load', {}, token), 'SESSION_EXPIRED');
});

console.log(`\n${passed} tests passed`);
