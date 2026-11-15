// Demo mode: runs backend/Code.js (already loaded as a global script) against an
// in-browser mock of Google Sheets that is saved in localStorage.
import { installGasMock } from './gas-mock.js';

let storage = null;
try { storage = window.localStorage; } catch (e) { /* private mode: memory only */ }
const mock = installGasMock({ storage });

let xlsxLib = null;
function loadXlsx() {
  if (xlsxLib) return Promise.resolve(xlsxLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { xlsxLib = window.XLSX; resolve(xlsxLib); };
    s.onerror = () => reject(new Error('xlsx load failed'));
    document.head.appendChild(s);
  });
}

// In demo mode the "spreadsheet" lives in localStorage, so build the .xlsx in the browser.
window.exportSpreadsheetXlsx_ = function (ss) {
  if (!xlsxLib) throw new window.AppError('EXPORT_FAILED');
  const wb = xlsxLib.utils.book_new();
  mock.sheetsOf(ss.getId()).forEach((sh) => {
    xlsxLib.utils.book_append_sheet(wb, xlsxLib.utils.aoa_to_sheet(sh.rows.length ? sh.rows : [[]]), sh.name.slice(0, 31));
  });
  return xlsxLib.write(wb, { type: 'base64', bookType: 'xlsx' });
};

export async function handle(payload) {
  if (payload.action === 'exportXlsx') {
    try { await loadXlsx(); } catch (e) { return { ok: false, code: 'NETWORK' }; }
  }
  // Work on a deep copy so the UI never shares objects with the mock store.
  const res = window.handleRequest_(JSON.parse(JSON.stringify(payload)));
  mock.persist();
  return JSON.parse(JSON.stringify(res));
}

export function resetDemo() { mock.reset(); }

/** Creates a sample school (username "demo", password "demo1234") with students and records. */
export function seedDemo() {
  const call = (action, data, token) => {
    const r = window.handleRequest_({ action, data, token });
    if (!r.ok) throw new Error(action + ': ' + JSON.stringify(r));
    return r.data;
  };
  let token;
  const login = window.handleRequest_({ action: 'login', data: { username: 'demo', password: 'demo1234' } });
  if (login.ok) { mock.persist(); return login.data; }
  const reg = call('register', {
    schoolName: 'Sri Saddharmodaya Daham Pasala', address: 'Kandy Road, Kelaniya', username: 'demo', password: 'demo1234',
    workingDays: ['Sun'], grades: ['1 ශ්‍රේණිය', '2 ශ්‍රේණිය', '3 ශ්‍රේණිය', '4 ශ්‍රේණිය', '5 ශ්‍රේණිය'],
    subjects: ['බුද්ධ චරිතය', 'ධර්මය', 'පාලි', 'සීලය']
  });
  token = reg.token;
  const settings = call('load', {}, token).settings;
  const first = ['Kasun', 'Nethmi', 'Dulaj', 'Sanduni', 'Tharindu', 'Imasha', 'Pasindu', 'Hiruni', 'Ravindu', 'Sachini', 'Yasiru', 'Dinithi', 'Chamod', 'Senuri', 'Akila', 'Thisari', 'Vihanga', 'Kavindi', 'Lahiru', 'Methsara'];
  const last = ['Perera', 'Silva', 'Fernando', 'Jayasinghe', 'Bandara', 'Wijesinghe', 'Gunawardena', 'Rathnayake'];
  const rels = ['Mother', 'Father', 'Mother', 'Father', 'Grandmother'];
  const now = new Date();
  const year = now.getFullYear();
  let n = 1;
  settings.grades.forEach((g, gi) => {
    for (let i = 0; i < 6; i++) {
      const f = first[(gi * 6 + i) % first.length];
      const l = last[(gi * 3 + i) % last.length];
      const female = /i$|ni$|ri$|ki$/.test(f) || ['Nethmi', 'Sanduni', 'Imasha', 'Hiruni', 'Sachini', 'Dinithi', 'Senuri', 'Thisari', 'Kavindi', 'Methsara'].includes(f);
      call('saveStudent', {
        isNew: true,
        student: {
          regNo: 'DP/' + String(n).padStart(3, '0'), fullName: `${f} ${l}`, nameWithInitials: `${l[0]}. ${f}`,
          gender: female ? 'F' : 'M', birthday: `${year - 6 - gi}-${String((i % 12) + 1).padStart(2, '0')}-${String(10 + i).padStart(2, '0')}`,
          grade: g, telephone: '07' + String(71234500 + n), address: 'Kelaniya',
          guardianName: `${['Nimal', 'Kumari', 'Sunil', 'Chandrika', 'Ranjith'][i % 5]} ${l}`, guardianRelationship: rels[i % 5],
          guardianPhone: '07' + String(76543200 + n), admissionDate: `${year - gi}-01-08`
        }
      }, token);
      n++;
    }
  });
  const students = call('load', {}, token).students;
  // Attendance for the last 6 Sundays.
  const d = new Date();
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  for (let w = 0; w < 6; w++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    settings.grades.forEach((g) => {
      const records = {};
      students.filter((s) => s.grade === g).forEach((s, i) => { records[s.regNo] = (i + w) % 5 === 0 ? 'A' : 'P'; });
      call('saveAttendance', { grade: g, date: iso, records }, token);
    });
    d.setDate(d.getDate() - 7);
  }
  const g1 = settings.grades[0];
  const exam = call('saveExam', { exam: { name: 'First term test', grade: g1, year: String(year), term: '1', date: `${year}-04-06`, subjects: settings.subjects, maxMarks: 100 } }, token).exam;
  settings.subjects.forEach((sub, si) => {
    call('saveExamMarks', {
      examId: exam.examId, subject: sub,
      entries: students.filter((s) => s.grade === g1).map((s, i) => ({ regNo: s.regNo, marks: String(55 + ((i * 7 + si * 11) % 45)) }))
    }, token);
  });
  const ev = call('saveEvent', { event: { name: 'Vesak Dharma Debate', type: 'Debate', date: `${year}-05-18`, grades: [], maxMarks: '50', description: 'Inter-grade debate' } }, token).event;
  call('saveEventMarks', { eventId: ev.eventId, entries: students.slice(18, 24).map((s, i) => ({ regNo: s.regNo, marks: String(45 - i * 3), place: i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : '', remarks: '' })) }, token);
  const nextMonth = new Date(year, now.getMonth() + 1, 15);
  call('saveEvent', { event: { name: 'Poson Meditation Program', type: 'Meditation', date: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-15`, grades: [], maxMarks: '' } }, token);
  call('savePrefect', { prefect: { regNo: students[students.length - 1].regNo, role: 'HeadPrefect', startDate: `${year}-01-08` } }, token);
  call('savePrefect', { prefect: { regNo: students[students.length - 2].regNo, role: 'Prefect', startDate: `${year}-01-08` } }, token);
  call('savePrefect', { prefect: { regNo: students[students.length - 3].regNo, role: 'Prefect', startDate: `${year - 1}-01-08`, endDate: `${year - 1}-12-20` } }, token);
  mock.persist();
  return reg;
}
