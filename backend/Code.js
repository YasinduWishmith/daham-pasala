/**
 * Dhamma School Manager — Google Apps Script backend.
 *
 * Paste this whole file into the Code.gs file of a Google Apps Script project
 * (see README.md). It stores every school in its own Google Spreadsheet.
 *
 * This same file is also loaded by the website itself:
 *  - always, to reuse the validation rules (validateStudent_ etc.), and
 *  - in demo mode, where it runs against an in-browser mock of SpreadsheetApp.
 * So nothing at the top level may call a Google service.
 */

var APP_VERSION = '1.0.0';
var SESSION_DAYS = 30;
var MAX_LOGIN_FAILS = 5;
var LOCK_MS = 25000;
var LIST_SEP = ' | ';
var DATA_FOLDER = 'Dhamma School Manager';

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var GENDERS = ['M', 'F'];
var STATUSES = ['Active', 'Left', 'Graduated'];
var RELATIONSHIPS = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Guardian', 'Other'];
var EVENT_TYPES = ['Debate', 'TalentShow', 'Meditation', 'PrefectProgram', 'Sports', 'Quiz', 'Essay', 'Art', 'Other'];
var PREFECT_ROLES = ['HeadPrefect', 'DeputyHeadPrefect', 'SeniorPrefect', 'Prefect', 'JuniorPrefect', 'ClassMonitor', 'Other'];

var SCHEMA = {
  Settings: ['Key', 'Value'],
  Students: ['RegNo', 'FullName', 'NameWithInitials', 'Gender', 'Birthday', 'Grade', 'Telephone', 'Address',
    'GuardianName', 'GuardianRelationship', 'GuardianPhone', 'AdmissionDate', 'Status', 'Notes', 'CreatedAt', 'UpdatedAt'],
  GradeHistory: ['RegNo', 'Grade', 'Year', 'FromDate', 'ToDate'],
  Exams: ['ExamId', 'Name', 'Grade', 'Year', 'Term', 'Date', 'Subjects', 'MaxMarks', 'CreatedAt'],
  ExamMarks: ['ExamId', 'RegNo', 'Subject', 'Marks', 'Absent'],
  Events: ['EventId', 'Name', 'Type', 'Date', 'Grades', 'Description', 'MaxMarks', 'CreatedAt'],
  EventMarks: ['EventId', 'RegNo', 'Marks', 'Place', 'Remarks'],
  Prefects: ['PrefectId', 'RegNo', 'Role', 'StartDate', 'EndDate', 'Notes']
};

var REGISTRY_SCHEMA = {
  Schools: ['SchoolId', 'SchoolName', 'Username', 'Salt', 'PasswordHash', 'SpreadsheetId', 'CreatedAt'],
  Sessions: ['Token', 'SchoolId', 'ExpiresAt']
};

var ATT_FIXED = ['RegNo', 'FullName'];

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

function doGet() {
  return jsonOut_({ ok: true, app: 'dhamma-school-manager', version: APP_VERSION });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, code: 'BAD_REQUEST' });
  }
  return jsonOut_(handleRequest_(req));
}

/** Run once from the Apps Script editor to create the registry spreadsheet and grant permissions. */
function setup() {
  var ss = registry_();
  Logger.log('Registry spreadsheet: ' + ss.getUrl());
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var PUBLIC_ACTIONS_ = {
  ping: function () { return { version: APP_VERSION }; },
  register: function (d) { return withLock_(function () { return apiRegister_(d); }); },
  login: function (d) { return withLock_(function () { return apiLogin_(d); }); }
};

var PRIVATE_ACTIONS_ = {
  load: apiLoad_,
  logout: apiLogout_,
  saveSettings: apiSaveSettings_,
  renameGrade: apiRenameGrade_,
  changePassword: apiChangePassword_,
  exportXlsx: apiExportXlsx_,
  shareSheet: apiShareSheet_,
  saveStudent: apiSaveStudent_,
  deleteStudent: apiDeleteStudent_,
  moveStudents: apiMoveStudents_,
  studentHistory: apiStudentHistory_,
  getAttendance: apiGetAttendance_,
  saveAttendance: apiSaveAttendance_,
  deleteAttendance: apiDeleteAttendance_,
  attendanceReport: apiAttendanceReport_,
  saveExam: apiSaveExam_,
  deleteExam: apiDeleteExam_,
  getExamMarks: apiGetExamMarks_,
  saveExamMarks: apiSaveExamMarks_,
  saveEvent: apiSaveEvent_,
  deleteEvent: apiDeleteEvent_,
  getEventMarks: apiGetEventMarks_,
  saveEventMarks: apiSaveEventMarks_,
  savePrefect: apiSavePrefect_,
  deletePrefect: apiDeletePrefect_
};

var READ_ONLY_ACTIONS_ = {
  load: true, studentHistory: true, getAttendance: true, attendanceReport: true,
  getExamMarks: true, getEventMarks: true, exportXlsx: true
};

function handleRequest_(req) {
  try {
    if (!req || typeof req !== 'object') fail_('BAD_REQUEST');
    var action = String(req.action || '');
    var data = req.data && typeof req.data === 'object' ? req.data : {};
    if (PUBLIC_ACTIONS_.hasOwnProperty(action)) {
      return { ok: true, data: PUBLIC_ACTIONS_[action](data) };
    }
    if (!PRIVATE_ACTIONS_.hasOwnProperty(action)) fail_('UNKNOWN_ACTION');
    var ctx = auth_(req.token);
    ctx.token = req.token;
    var handler = PRIVATE_ACTIONS_[action];
    var result = READ_ONLY_ACTIONS_[action]
      ? handler(ctx, data)
      : withLock_(function () { return handler(ctx, data); });
    return { ok: true, data: result };
  } catch (err) {
    return errorOut_(err);
  }
}

/* ------------------------------------------------------------------ */
/* Errors, locking, small helpers                                      */
/* ------------------------------------------------------------------ */

function AppError(code, field, extra) {
  this.code = code;
  this.field = field || null;
  this.extra = extra || null;
}

function fail_(code, field, extra) { throw new AppError(code, field, extra); }

function failFields_(fields) { throw new AppError('VALIDATION', null, { fields: fields }); }

function errorOut_(err) {
  if (err instanceof AppError) return { ok: false, code: err.code, field: err.field, extra: err.extra };
  console.error(err && err.stack ? err.stack : err);
  return { ok: false, code: 'SERVER_ERROR', detail: String(err && err.message ? err.message : err) };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) fail_('BUSY');
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function isoDate_(d) {
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function today_() { return isoDate_(new Date()); }

function nowIso_() {
  var d = new Date();
  return isoDate_(d) + ' ' + pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

function newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function str_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/\s+/g, ' ').trim();
  return max ? s.slice(0, max + 1) : s;
}

function cellStr_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return isoDate_(v);
  }
  if (typeof v === 'boolean') return v ? 'Y' : '';
  return String(v).trim();
}

function keyOf_(h) { return h.charAt(0).toLowerCase() + h.slice(1); }

function splitList_(s) {
  if (Array.isArray(s)) return s;
  return String(s || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean);
}

function joinList_(arr) { return (arr || []).join(LIST_SEP); }

function hasKeys_(o) { for (var k in o) if (o.hasOwnProperty(k)) return true; return false; }

function toHex_(bytes) {
  return bytes.map(function (b) { var v = (b + 256) % 256; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}

function hashPassword_(password, salt) {
  var h = salt + '|' + password;
  for (var i = 0; i < 200; i++) {
    h = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* Validation (shared with the website)                                */
/* ------------------------------------------------------------------ */

function validDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2] && p[0] >= 1900 && p[0] <= 2200;
}

/** Normalises a Sri Lankan phone number to 0XXXXXXXXX, or returns null when invalid. */
function normPhone_(s) {
  var v = String(s || '').replace(/[\s\-().]/g, '');
  var m = /^(?:\+94|0094|94|0)?([1-9]\d{8})$/.exec(v);
  return m ? '0' + m[1] : null;
}

function normUsername_(s) { return String(s || '').trim().toLowerCase(); }

function cleanList_(arr, max) {
  var out = [];
  (Array.isArray(arr) ? arr : splitList_(arr)).forEach(function (x) {
    var v = str_(x, max);
    if (v) out.push(v);
  });
  return out;
}

/** Validates a list of names (grades/subjects). Returns an error code or ''. */
function listError_(list) {
  if (!list.length) return 'LIST_REQUIRED';
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    if (v.length > 40) return 'TOO_LONG';
    if (/[|\[\]:*?\/\\]/.test(v)) return 'INVALID_CHARS';
    var k = v.toLowerCase();
    if (seen[k]) return 'DUPLICATE';
    seen[k] = true;
  }
  return '';
}

function validateSchoolSetup_(d, isRegister) {
  var e = {};
  var schoolName = str_(d.schoolName, 100);
  if (!schoolName) e.schoolName = 'REQUIRED'; else if (schoolName.length > 100) e.schoolName = 'TOO_LONG';
  if (str_(d.address, 200).length > 200) e.address = 'TOO_LONG';
  if (isRegister) {
    var u = normUsername_(d.username);
    if (!u) e.username = 'REQUIRED'; else if (!/^[a-z0-9._-]{3,30}$/.test(u)) e.username = 'USERNAME_INVALID';
    var p = String(d.password || '');
    if (!p) e.password = 'REQUIRED'; else if (p.length < 8) e.password = 'PASSWORD_SHORT'; else if (p.length > 100) e.password = 'TOO_LONG';
  }
  var days = (Array.isArray(d.workingDays) ? d.workingDays : []).filter(function (x) { return DAYS.indexOf(x) >= 0; });
  if (!days.length) e.workingDays = 'LIST_REQUIRED';
  var ge = listError_(cleanList_(d.grades, 41));
  if (ge) e.grades = ge;
  var se = listError_(cleanList_(d.subjects, 41));
  if (se) e.subjects = se;
  if (!isRegister && d.academicYear !== undefined && !/^\d{4}$/.test(String(d.academicYear))) e.academicYear = 'YEAR_INVALID';
  return e;
}

/** Trims and normalises a student object coming from the form. */
function cleanStudent_(s) {
  s = s || {};
  var out = {};
  SCHEMA.Students.forEach(function (h) { out[keyOf_(h)] = str_(s[keyOf_(h)], 600); });
  out.regNo = out.regNo.toUpperCase();
  var t = normPhone_(out.telephone); if (t) out.telephone = t;
  var g = normPhone_(out.guardianPhone); if (g) out.guardianPhone = g;
  return out;
}

/** Returns {field: errorCode} for a cleaned student. */
function validateStudent_(s, settings) {
  var e = {};
  var today = today_();
  if (!s.regNo) e.regNo = 'REQUIRED'; else if (!/^[A-Z0-9][A-Z0-9\/\-_.]{0,19}$/.test(s.regNo)) e.regNo = 'REGNO_INVALID';
  if (!s.fullName) e.fullName = 'REQUIRED'; else if (s.fullName.length > 150) e.fullName = 'TOO_LONG';
  if (s.nameWithInitials.length > 80) e.nameWithInitials = 'TOO_LONG';
  if (!s.gender) e.gender = 'REQUIRED'; else if (GENDERS.indexOf(s.gender) < 0) e.gender = 'VALUE_INVALID';
  if (!s.birthday) e.birthday = 'REQUIRED';
  else if (!validDate_(s.birthday)) e.birthday = 'DATE_INVALID';
  else if (s.birthday > today) e.birthday = 'DATE_FUTURE';
  if (!s.grade) e.grade = 'REQUIRED';
  else if (settings && (settings.grades || []).indexOf(s.grade) < 0) e.grade = 'GRADE_INVALID';
  if (s.telephone && !normPhone_(s.telephone)) e.telephone = 'PHONE_INVALID';
  if (s.address.length > 200) e.address = 'TOO_LONG';
  if (!s.guardianName) e.guardianName = 'REQUIRED'; else if (s.guardianName.length > 150) e.guardianName = 'TOO_LONG';
  if (!s.guardianRelationship) e.guardianRelationship = 'REQUIRED';
  else if (RELATIONSHIPS.indexOf(s.guardianRelationship) < 0) e.guardianRelationship = 'VALUE_INVALID';
  if (!s.guardianPhone) e.guardianPhone = 'REQUIRED'; else if (!normPhone_(s.guardianPhone)) e.guardianPhone = 'PHONE_INVALID';
  if (s.admissionDate) {
    if (!validDate_(s.admissionDate)) e.admissionDate = 'DATE_INVALID';
    else if (s.admissionDate > today) e.admissionDate = 'DATE_FUTURE';
    else if (!e.birthday && s.admissionDate < s.birthday) e.admissionDate = 'DATE_BEFORE_BIRTHDAY';
  }
  if (s.status && STATUSES.indexOf(s.status) < 0) e.status = 'VALUE_INVALID';
  if (s.notes.length > 500) e.notes = 'TOO_LONG';
  return e;
}

function cleanExam_(x) {
  x = x || {};
  return {
    examId: str_(x.examId, 20), name: str_(x.name, 100), grade: str_(x.grade, 41), year: str_(x.year, 4),
    term: str_(x.term, 10), date: str_(x.date, 10), subjects: cleanList_(x.subjects, 41),
    maxMarks: str_(x.maxMarks, 6)
  };
}

function validateExam_(x, settings) {
  var e = {};
  if (!x.name) e.name = 'REQUIRED'; else if (x.name.length > 100) e.name = 'TOO_LONG';
  if (!x.grade) e.grade = 'REQUIRED'; else if (settings && settings.grades.indexOf(x.grade) < 0) e.grade = 'GRADE_INVALID';
  if (!/^\d{4}$/.test(x.year)) e.year = 'YEAR_INVALID';
  if (x.term && ['1', '2', '3'].indexOf(x.term) < 0) e.term = 'VALUE_INVALID';
  if (x.date && !validDate_(x.date)) e.date = 'DATE_INVALID';
  if (!x.subjects.length) e.subjects = 'LIST_REQUIRED';
  var m = Number(x.maxMarks);
  if (x.maxMarks === '') e.maxMarks = 'REQUIRED';
  else if (!isFinite(m) || m <= 0 || m > 1000) e.maxMarks = 'NUMBER_RANGE';
  return e;
}

function cleanEvent_(x) {
  x = x || {};
  return {
    eventId: str_(x.eventId, 20), name: str_(x.name, 100), type: str_(x.type, 30), date: str_(x.date, 10),
    grades: cleanList_(x.grades, 41), description: str_(x.description, 500), maxMarks: str_(x.maxMarks, 6)
  };
}

function validateEvent_(x, settings) {
  var e = {};
  if (!x.name) e.name = 'REQUIRED'; else if (x.name.length > 100) e.name = 'TOO_LONG';
  if (EVENT_TYPES.indexOf(x.type) < 0) e.type = 'REQUIRED';
  if (!x.date) e.date = 'REQUIRED'; else if (!validDate_(x.date)) e.date = 'DATE_INVALID';
  if (settings) x.grades.forEach(function (g) { if (settings.grades.indexOf(g) < 0) e.grades = 'GRADE_INVALID'; });
  if (x.description.length > 500) e.description = 'TOO_LONG';
  if (x.maxMarks !== '') {
    var m = Number(x.maxMarks);
    if (!isFinite(m) || m < 0 || m > 1000) e.maxMarks = 'NUMBER_RANGE';
  }
  return e;
}

function cleanPrefect_(x) {
  x = x || {};
  return {
    prefectId: str_(x.prefectId, 20), regNo: str_(x.regNo, 20).toUpperCase(), role: str_(x.role, 30),
    startDate: str_(x.startDate, 10), endDate: str_(x.endDate, 10), notes: str_(x.notes, 300)
  };
}

function validatePrefect_(x) {
  var e = {};
  if (!x.regNo) e.regNo = 'REQUIRED';
  if (PREFECT_ROLES.indexOf(x.role) < 0) e.role = 'REQUIRED';
  if (!x.startDate) e.startDate = 'REQUIRED'; else if (!validDate_(x.startDate)) e.startDate = 'DATE_INVALID';
  if (x.endDate) {
    if (!validDate_(x.endDate)) e.endDate = 'DATE_INVALID';
    else if (x.startDate && x.endDate < x.startDate) e.endDate = 'END_BEFORE_START';
  }
  if (x.notes.length > 300) e.notes = 'TOO_LONG';
  return e;
}

/** Validates a marks value; returns '' when ok. max <= 0 means no upper limit check. */
function marksError_(v, max) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  if (!isFinite(n) || String(v).trim() === '') return 'NUMBER_INVALID';
  if (n < 0 || (max > 0 && n > max)) return 'MARKS_RANGE';
  return '';
}

/* ------------------------------------------------------------------ */
/* Spreadsheet table helpers                                           */
/* ------------------------------------------------------------------ */

function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    writeTable_(sh, header || SCHEMA[name] || REGISTRY_SCHEMA[name] || ATT_FIXED, []);
  }
  return sh;
}

function readTable_(sh) {
  if (sh.getLastRow() < 1) return { header: [], rows: [] };
  var vals = sh.getDataRange().getValues();
  var header = vals[0].map(cellStr_);
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i].map(cellStr_);
    if (r.some(function (v) { return v !== ''; })) rows.push(r);
  }
  return { header: header, rows: rows };
}

function writeTable_(sh, header, rows) {
  var width = header.length;
  var data = [header.slice()];
  rows.forEach(function (r) {
    var a = r.slice(0, width);
    while (a.length < width) a.push('');
    data.push(a.map(function (v) { return v === null || v === undefined ? '' : String(v); }));
  });
  if (sh.getMaxRows() < data.length) sh.insertRowsAfter(sh.getMaxRows(), data.length - sh.getMaxRows());
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.clearContents();
  var rng = sh.getRange(1, 1, data.length, width);
  rng.setNumberFormat('@');
  rng.setValues(data);
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#fbe3c4');
  sh.setFrozenRows(1);
}

function loadObjs_(ss, name, schema) {
  var cols = (schema || SCHEMA)[name];
  var t = readTable_(sheet_(ss, name, cols));
  var keys = t.header.map(keyOf_);
  return t.rows.map(function (r) {
    var o = {};
    cols.forEach(function (h) { o[keyOf_(h)] = ''; });
    keys.forEach(function (k, i) { if (k) o[k] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

function saveObjs_(ss, name, objs, schema) {
  var cols = (schema || SCHEMA)[name];
  var rows = objs.map(function (o) {
    return cols.map(function (h) { var v = o[keyOf_(h)]; return v === undefined || v === null ? '' : v; });
  });
  writeTable_(sheet_(ss, name, cols), cols, rows);
}

function initSheets_(ss, schema) {
  var names = Object.keys(schema);
  var first = ss.getSheets()[0];
  names.forEach(function (n, i) {
    var sh = i === 0 && first ? first.setName(n) : ss.insertSheet(n);
    writeTable_(sh, schema[n], []);
  });
}

function moveToFolder_(fileId) {
  try {
    var it = DriveApp.getFoldersByName(DATA_FOLDER);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(DATA_FOLDER);
    DriveApp.getFileById(fileId).moveTo(folder);
  } catch (e) {
    // Not fatal: the file simply stays in the Drive root (or DriveApp is unavailable in demo mode).
  }
}

/* ------------------------------------------------------------------ */
/* Registry, sessions, auth                                            */
/* ------------------------------------------------------------------ */

function registry_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('REGISTRY_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recreated below */ }
  }
  var ss = SpreadsheetApp.create('Dhamma School Manager - Registry');
  initSheets_(ss, REGISTRY_SCHEMA);
  moveToFolder_(ss.getId());
  props.setProperty('REGISTRY_ID', ss.getId());
  return ss;
}

function getSchool_(schoolId) {
  var cache = CacheService.getScriptCache();
  var c = cache.get('school_' + schoolId);
  if (c) return JSON.parse(c);
  var all = loadObjs_(registry_(), 'Schools', REGISTRY_SCHEMA);
  for (var i = 0; i < all.length; i++) {
    if (all[i].schoolId === schoolId) {
      cache.put('school_' + schoolId, JSON.stringify(all[i]), 21600);
      return all[i];
    }
  }
  return null;
}

function auth_(token) {
  if (!token || typeof token !== 'string') fail_('AUTH_REQUIRED');
  var cache = CacheService.getScriptCache();
  var schoolId = cache.get('s_' + token);
  if (!schoolId) {
    var sessions = loadObjs_(registry_(), 'Sessions', REGISTRY_SCHEMA);
    var s = null;
    for (var i = 0; i < sessions.length; i++) if (sessions[i].token === token) { s = sessions[i]; break; }
    if (!s || Number(s.expiresAt) < Date.now()) fail_('SESSION_EXPIRED');
    schoolId = s.schoolId;
    cache.put('s_' + token, schoolId, 21600);
  }
  var school = getSchool_(schoolId);
  if (!school) fail_('SESSION_EXPIRED');
  return { schoolId: schoolId, school: school, ss: SpreadsheetApp.openById(school.spreadsheetId) };
}

function startSession_(reg, school) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var now = Date.now();
  var sessions = loadObjs_(reg, 'Sessions', REGISTRY_SCHEMA).filter(function (s) { return Number(s.expiresAt) > now; });
  sessions.push({ token: token, schoolId: school.schoolId, expiresAt: String(now + SESSION_DAYS * 86400000) });
  saveObjs_(reg, 'Sessions', sessions, REGISTRY_SCHEMA);
  CacheService.getScriptCache().put('s_' + token, school.schoolId, 21600);
  return { token: token, school: { name: school.schoolName, username: school.username } };
}

function apiRegister_(d) {
  var e = validateSchoolSetup_(d, true);
  if (hasKeys_(e)) failFields_(e);
  var reg = registry_();
  var schools = loadObjs_(reg, 'Schools', REGISTRY_SCHEMA);
  var username = normUsername_(d.username);
  if (schools.some(function (s) { return s.username === username; })) failFields_({ username: 'USERNAME_TAKEN' });

  var schoolName = str_(d.schoolName, 100);
  var ss = SpreadsheetApp.create(schoolName + ' - Dhamma School');
  initSheets_(ss, SCHEMA);
  var settings = {
    schoolName: schoolName,
    address: str_(d.address, 200),
    workingDays: DAYS.filter(function (x) { return d.workingDays.indexOf(x) >= 0; }),
    grades: cleanList_(d.grades, 41),
    subjects: cleanList_(d.subjects, 41),
    academicYear: String(new Date().getFullYear()),
    gradeTabs: {}
  };
  ensureGradeTabs_(ss, settings);
  saveSettings_(ss, settings);
  moveToFolder_(ss.getId());

  var salt = Utilities.getUuid();
  var school = {
    schoolId: newId_('S'), schoolName: schoolName, username: username, salt: salt,
    passwordHash: hashPassword_(String(d.password), salt), spreadsheetId: ss.getId(), createdAt: nowIso_()
  };
  schools.push(school);
  saveObjs_(reg, 'Schools', schools, REGISTRY_SCHEMA);
  return startSession_(reg, school);
}

function apiLogin_(d) {
  var username = normUsername_(d.username);
  var password = String(d.password || '');
  var e = {};
  if (!username) e.username = 'REQUIRED';
  if (!password) e.password = 'REQUIRED';
  if (hasKeys_(e)) failFields_(e);
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_LOGIN_FAILS) fail_('TOO_MANY_ATTEMPTS');
  var reg = registry_();
  var schools = loadObjs_(reg, 'Schools', REGISTRY_SCHEMA);
  var school = null;
  for (var i = 0; i < schools.length; i++) if (schools[i].username === username) { school = schools[i]; break; }
  if (!school || hashPassword_(password, school.salt) !== school.passwordHash) {
    cache.put(failKey, String(fails + 1), 900);
    fail_('LOGIN_INVALID');
  }
  cache.remove(failKey);
  return startSession_(reg, school);
}

function apiLogout_(ctx) {
  var reg = registry_();
  var sessions = loadObjs_(reg, 'Sessions', REGISTRY_SCHEMA).filter(function (s) { return s.token !== ctx.token; });
  saveObjs_(reg, 'Sessions', sessions, REGISTRY_SCHEMA);
  CacheService.getScriptCache().remove('s_' + ctx.token);
  return {};
}

function apiChangePassword_(ctx, d) {
  var e = {};
  var cur = String(d.currentPassword || '');
  var next = String(d.newPassword || '');
  if (!cur) e.currentPassword = 'REQUIRED';
  if (!next) e.newPassword = 'REQUIRED'; else if (next.length < 8) e.newPassword = 'PASSWORD_SHORT'; else if (next.length > 100) e.newPassword = 'TOO_LONG';
  if (hasKeys_(e)) failFields_(e);
  var reg = registry_();
  var schools = loadObjs_(reg, 'Schools', REGISTRY_SCHEMA);
  var s = schools.filter(function (x) { return x.schoolId === ctx.schoolId; })[0];
  if (!s) fail_('SESSION_EXPIRED');
  if (hashPassword_(cur, s.salt) !== s.passwordHash) failFields_({ currentPassword: 'PASSWORD_WRONG' });
  s.salt = Utilities.getUuid();
  s.passwordHash = hashPassword_(next, s.salt);
  saveObjs_(reg, 'Schools', schools, REGISTRY_SCHEMA);
  // Sign out every other device.
  var sessions = loadObjs_(reg, 'Sessions', REGISTRY_SCHEMA).filter(function (x) {
    if (x.schoolId === ctx.schoolId && x.token !== ctx.token) {
      CacheService.getScriptCache().remove('s_' + x.token);
      return false;
    }
    return true;
  });
  saveObjs_(reg, 'Sessions', sessions, REGISTRY_SCHEMA);
  CacheService.getScriptCache().remove('school_' + ctx.schoolId);
  return {};
}

/* ------------------------------------------------------------------ */
/* Settings and grade tabs                                             */
/* ------------------------------------------------------------------ */

function getSettings_(ss) {
  var s = {};
  loadObjs_(ss, 'Settings').forEach(function (r) {
    if (!r.key) return;
    try { s[r.key] = JSON.parse(r.value); } catch (e) { s[r.key] = r.value; }
  });
  s.grades = Array.isArray(s.grades) ? s.grades : [];
  s.subjects = Array.isArray(s.subjects) ? s.subjects : [];
  s.workingDays = Array.isArray(s.workingDays) ? s.workingDays : [];
  s.gradeTabs = s.gradeTabs && typeof s.gradeTabs === 'object' ? s.gradeTabs : {};
  s.academicYear = String(s.academicYear || new Date().getFullYear());
  s.schoolName = s.schoolName || '';
  s.address = s.address || '';
  return s;
}

function saveSettings_(ss, s) {
  var order = ['schoolName', 'address', 'workingDays', 'grades', 'subjects', 'academicYear', 'gradeTabs'];
  saveObjs_(ss, 'Settings', order.map(function (k) {
    var v = s[k];
    return { key: k, value: typeof v === 'string' ? v : JSON.stringify(v) };
  }));
}

function tabNameFor_(ss, grade, taken) {
  var base = ('Att_' + grade.replace(/[\[\]:*?\/\\']/g, '').replace(/\s+/g, '_')).slice(0, 28);
  var name = base;
  var n = 2;
  while (ss.getSheetByName(name) || taken[name]) { name = base + '_' + n; n++; }
  return name;
}

function ensureGradeTabs_(ss, settings) {
  var taken = {};
  Object.keys(settings.gradeTabs).forEach(function (g) { taken[settings.gradeTabs[g]] = true; });
  settings.grades.forEach(function (g) {
    var tab = settings.gradeTabs[g];
    if (!tab || !ss.getSheetByName(tab)) {
      tab = tab && !ss.getSheetByName(tab) ? tab : tabNameFor_(ss, g, taken);
      taken[tab] = true;
      settings.gradeTabs[g] = tab;
      sheet_(ss, tab, ATT_FIXED);
    }
  });
}

function gradeTab_(ss, settings, grade) {
  if (settings.grades.indexOf(grade) < 0) failFields_({ grade: 'GRADE_INVALID' });
  var tab = settings.gradeTabs[grade];
  if (!tab || !ss.getSheetByName(tab)) {
    ensureGradeTabs_(ss, settings);
    saveSettings_(ss, settings);
    tab = settings.gradeTabs[grade];
  }
  return ss.getSheetByName(tab);
}

function apiSaveSettings_(ctx, d) {
  var e = validateSchoolSetup_(d, false);
  if (hasKeys_(e)) failFields_(e);
  var ss = ctx.ss;
  var s = getSettings_(ss);
  var grades = cleanList_(d.grades, 41);
  var removed = s.grades.filter(function (g) { return grades.indexOf(g) < 0; });
  if (removed.length) {
    var students = loadObjs_(ss, 'Students');
    var busy = removed.filter(function (g) {
      return students.some(function (st) { return st.grade === g && st.status === 'Active'; });
    });
    if (busy.length) failFields_({ grades: 'GRADE_HAS_STUDENTS:' + busy.join(', ') });
  }
  s.schoolName = str_(d.schoolName, 100);
  s.address = str_(d.address, 200);
  s.workingDays = DAYS.filter(function (x) { return d.workingDays.indexOf(x) >= 0; });
  s.grades = grades;
  s.subjects = cleanList_(d.subjects, 41);
  if (d.academicYear) s.academicYear = String(d.academicYear);
  ensureGradeTabs_(ss, s);
  saveSettings_(ss, s);
  if (s.schoolName !== ctx.school.schoolName) {
    var reg = registry_();
    var schools = loadObjs_(reg, 'Schools', REGISTRY_SCHEMA);
    schools.forEach(function (x) { if (x.schoolId === ctx.schoolId) x.schoolName = s.schoolName; });
    saveObjs_(reg, 'Schools', schools, REGISTRY_SCHEMA);
    CacheService.getScriptCache().remove('school_' + ctx.schoolId);
    try { ss.rename(s.schoolName + ' - Dhamma School'); } catch (err) { /* ignore */ }
  }
  return { settings: publicSettings_(s) };
}

function apiRenameGrade_(ctx, d) {
  var ss = ctx.ss;
  var s = getSettings_(ss);
  var from = str_(d.from, 41);
  var to = str_(d.to, 41);
  var idx = s.grades.indexOf(from);
  if (idx < 0) failFields_({ from: 'GRADE_INVALID' });
  if (!to) failFields_({ to: 'REQUIRED' });
  var err = listError_(s.grades.map(function (g, i) { return i === idx ? to : g; }));
  if (err) failFields_({ to: err });
  s.grades[idx] = to;
  s.gradeTabs[to] = s.gradeTabs[from];
  delete s.gradeTabs[from];
  saveSettings_(ss, s);
  var students = loadObjs_(ss, 'Students');
  students.forEach(function (x) { if (x.grade === from) x.grade = to; });
  saveObjs_(ss, 'Students', students);
  var gh = loadObjs_(ss, 'GradeHistory');
  gh.forEach(function (x) { if (x.grade === from) x.grade = to; });
  saveObjs_(ss, 'GradeHistory', gh);
  var exams = loadObjs_(ss, 'Exams');
  exams.forEach(function (x) { if (x.grade === from) x.grade = to; });
  saveObjs_(ss, 'Exams', exams);
  var events = loadObjs_(ss, 'Events');
  events.forEach(function (x) { x.grades = joinList_(splitList_(x.grades).map(function (g) { return g === from ? to : g; })); });
  saveObjs_(ss, 'Events', events);
  return { settings: publicSettings_(s) };
}

function publicSettings_(s) {
  return {
    schoolName: s.schoolName, address: s.address, workingDays: s.workingDays, grades: s.grades,
    subjects: s.subjects, academicYear: s.academicYear
  };
}

function apiExportXlsx_(ctx) {
  var s = getSettings_(ctx.ss);
  var name = (s.schoolName || 'school').replace(/[^\w඀-෿஀-௿ -]+/g, '').trim() || 'school';
  return { filename: name + ' ' + today_() + '.xlsx', base64: exportSpreadsheetXlsx_(ctx.ss) };
}

/** Overridden in demo mode. */
function exportSpreadsheetXlsx_(ss) {
  SpreadsheetApp.flush();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx';
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) fail_('EXPORT_FAILED');
  return Utilities.base64Encode(resp.getContent());
}

function apiShareSheet_(ctx, d) {
  var email = str_(d.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failFields_({ email: 'EMAIL_INVALID' });
  try {
    if (d.role === 'edit') ctx.ss.addEditor(email); else ctx.ss.addViewer(email);
  } catch (e) {
    fail_('SHARE_FAILED');
  }
  return { url: ctx.ss.getUrl() };
}

/* ------------------------------------------------------------------ */
/* Load (everything the app needs at start)                            */
/* ------------------------------------------------------------------ */

function apiLoad_(ctx) {
  var ss = ctx.ss;
  var s = getSettings_(ss);
  return {
    school: { name: s.schoolName, username: ctx.school.username },
    settings: publicSettings_(s),
    students: loadObjs_(ss, 'Students'),
    exams: loadObjs_(ss, 'Exams').map(examOut_),
    events: loadObjs_(ss, 'Events').map(eventOut_),
    eventMarks: loadObjs_(ss, 'EventMarks'),
    prefects: loadObjs_(ss, 'Prefects'),
    attendance: attendanceSummary_(ss, s)
  };
}

function examOut_(x) { x.subjects = splitList_(x.subjects); return x; }
function eventOut_(x) { x.grades = splitList_(x.grades); return x; }

/** Per-student present/absent counts for the academic year, and the latest day per grade. */
function attendanceSummary_(ss, s) {
  var byStudent = {};
  var lastByGrade = {};
  var year = s.academicYear;
  s.grades.forEach(function (g) {
    var tab = s.gradeTabs[g];
    var sh = tab && ss.getSheetByName(tab);
    if (!sh) return;
    var t = readTable_(sh);
    var last = -1;
    t.header.forEach(function (h, ci) {
      if (ci < ATT_FIXED.length || h.slice(0, 4) !== year) return;
      var used = false;
      t.rows.forEach(function (r) {
        var v = r[ci];
        if (v !== 'P' && v !== 'A') return;
        used = true;
        var b = byStudent[r[0]] || (byStudent[r[0]] = { p: 0, a: 0 });
        if (v === 'P') b.p++; else b.a++;
      });
      if (used && (last < 0 || h > t.header[last])) last = ci;
    });
    if (last >= 0) {
      var p = 0, a = 0;
      t.rows.forEach(function (r) { if (r[last] === 'P') p++; else if (r[last] === 'A') a++; });
      lastByGrade[g] = { date: t.header[last], p: p, a: a };
    }
  });
  return { year: year, byStudent: byStudent, lastByGrade: lastByGrade };
}

/* ------------------------------------------------------------------ */
/* Students                                                            */
/* ------------------------------------------------------------------ */

function findStudent_(students, regNo) {
  for (var i = 0; i < students.length; i++) if (students[i].regNo === regNo) return i;
  return -1;
}

function changeGrade_(gh, regNo, grade, date) {
  gh.forEach(function (h) { if (h.regNo === regNo && !h.toDate) h.toDate = date; });
  if (grade) gh.push({ regNo: regNo, grade: grade, year: date.slice(0, 4), fromDate: date, toDate: '' });
}

function apiSaveStudent_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var s = cleanStudent_(d.student);
  var e = validateStudent_(s, settings);
  if (hasKeys_(e)) failFields_(e);
  var students = loadObjs_(ss, 'Students');
  var idx = findStudent_(students, s.regNo);
  var gh = loadObjs_(ss, 'GradeHistory');
  var today = today_();
  if (d.isNew) {
    if (idx >= 0) failFields_({ regNo: 'REGNO_EXISTS' });
    s.status = s.status || 'Active';
    s.admissionDate = s.admissionDate || today;
    s.createdAt = nowIso_();
    s.updatedAt = s.createdAt;
    students.push(s);
    changeGrade_(gh, s.regNo, s.grade, s.admissionDate);
  } else {
    if (idx < 0) fail_('STUDENT_NOT_FOUND');
    var old = students[idx];
    s.createdAt = old.createdAt;
    s.updatedAt = nowIso_();
    s.status = s.status || old.status || 'Active';
    if (s.status !== 'Active') {
      if (old.status === 'Active') changeGrade_(gh, s.regNo, '', today);
    } else if (old.status !== 'Active' || old.grade !== s.grade) {
      changeGrade_(gh, s.regNo, s.grade, today);
    }
    students[idx] = s;
  }
  saveObjs_(ss, 'Students', students);
  saveObjs_(ss, 'GradeHistory', gh);
  return { student: s };
}

function apiDeleteStudent_(ctx, d) {
  var ss = ctx.ss;
  var regNo = str_(d.regNo, 20).toUpperCase();
  var students = loadObjs_(ss, 'Students');
  if (findStudent_(students, regNo) < 0) fail_('STUDENT_NOT_FOUND');
  var notIt = function (x) { return x.regNo !== regNo; };
  saveObjs_(ss, 'Students', students.filter(notIt));
  ['GradeHistory', 'ExamMarks', 'EventMarks', 'Prefects'].forEach(function (n) {
    var all = loadObjs_(ss, n);
    var keep = all.filter(notIt);
    if (keep.length !== all.length) saveObjs_(ss, n, keep);
  });
  attTabs_(ss).forEach(function (sh) {
    var t = readTable_(sh);
    var keep = t.rows.filter(function (r) { return r[0] !== regNo; });
    if (keep.length !== t.rows.length) writeTable_(sh, t.header, keep);
  });
  return {};
}

/** Moves students to another grade, or marks them Graduated / Left (toGrade = '@Graduated' / '@Left'). */
function apiMoveStudents_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var regNos = (Array.isArray(d.regNos) ? d.regNos : []).map(function (r) { return str_(r, 20).toUpperCase(); });
  var to = str_(d.toGrade, 41);
  if (!regNos.length) failFields_({ regNos: 'LIST_REQUIRED' });
  var special = to === '@Graduated' || to === '@Left';
  if (!special && settings.grades.indexOf(to) < 0) failFields_({ toGrade: 'GRADE_INVALID' });
  var date = d.date && validDate_(d.date) ? d.date : today_();
  var students = loadObjs_(ss, 'Students');
  var gh = loadObjs_(ss, 'GradeHistory');
  var changed = [];
  regNos.forEach(function (r) {
    var i = findStudent_(students, r);
    if (i < 0) return;
    var st = students[i];
    if (special) {
      st.status = to.slice(1);
      changeGrade_(gh, r, '', date);
    } else {
      if (st.grade === to && st.status === 'Active') return;
      st.grade = to;
      st.status = 'Active';
      changeGrade_(gh, r, to, date);
    }
    st.updatedAt = nowIso_();
    changed.push(st);
  });
  saveObjs_(ss, 'Students', students);
  saveObjs_(ss, 'GradeHistory', gh);
  return { students: changed };
}

function attTabs_(ss) {
  return ss.getSheets().filter(function (sh) { return sh.getName().indexOf('Att_') === 0; });
}

function apiStudentHistory_(ctx, d) {
  var ss = ctx.ss;
  var regNo = str_(d.regNo, 20).toUpperCase();
  var settings = getSettings_(ss);
  var students = loadObjs_(ss, 'Students');
  var idx = findStudent_(students, regNo);
  if (idx < 0) fail_('STUDENT_NOT_FOUND');
  var tabToGrade = {};
  Object.keys(settings.gradeTabs).forEach(function (g) { tabToGrade[settings.gradeTabs[g]] = g; });

  var attendance = [];
  attTabs_(ss).forEach(function (sh) {
    var t = readTable_(sh);
    var row = t.rows.filter(function (r) { return r[0] === regNo; })[0];
    if (!row) return;
    var grade = tabToGrade[sh.getName()] || sh.getName().slice(4);
    t.header.forEach(function (h, ci) {
      if (ci >= ATT_FIXED.length && (row[ci] === 'P' || row[ci] === 'A')) attendance.push({ date: h, grade: grade, status: row[ci] });
    });
  });
  attendance.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var exams = loadObjs_(ss, 'Exams').map(examOut_);
  var marks = loadObjs_(ss, 'ExamMarks');
  var examResults = [];
  exams.forEach(function (ex) {
    var em = marks.filter(function (m) { return m.examId === ex.examId; });
    var mine = em.filter(function (m) { return m.regNo === regNo; });
    if (!mine.length) return;
    var totals = {};
    em.forEach(function (m) { totals[m.regNo] = (totals[m.regNo] || 0) + (m.absent === 'Y' ? 0 : Number(m.marks) || 0); });
    var myTotal = totals[regNo];
    var rank = 1;
    Object.keys(totals).forEach(function (k) { if (totals[k] > myTotal) rank++; });
    examResults.push({
      exam: ex, total: myTotal, rank: rank, of: Object.keys(totals).length,
      marks: mine.map(function (m) { return { subject: m.subject, marks: m.marks, absent: m.absent === 'Y' }; })
    });
  });
  examResults.sort(function (a, b) { return (a.exam.date || a.exam.year) < (b.exam.date || b.exam.year) ? 1 : -1; });

  var events = loadObjs_(ss, 'Events').map(eventOut_);
  var evMap = {};
  events.forEach(function (ev) { evMap[ev.eventId] = ev; });
  var eventResults = loadObjs_(ss, 'EventMarks')
    .filter(function (m) { return m.regNo === regNo && evMap[m.eventId]; })
    .map(function (m) { return { event: evMap[m.eventId], marks: m.marks, place: m.place, remarks: m.remarks }; })
    .sort(function (a, b) { return a.event.date < b.event.date ? 1 : -1; });

  return {
    student: students[idx],
    gradeHistory: loadObjs_(ss, 'GradeHistory').filter(function (h) { return h.regNo === regNo; })
      .sort(function (a, b) { return a.fromDate < b.fromDate ? 1 : -1; }),
    attendance: attendance,
    exams: examResults,
    events: eventResults,
    prefects: loadObjs_(ss, 'Prefects').filter(function (p) { return p.regNo === regNo; })
      .sort(function (a, b) { return a.startDate < b.startDate ? 1 : -1; })
  };
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

function dayOf_(date) {
  var p = date.split('-').map(Number);
  return DAYS[new Date(p[0], p[1] - 1, p[2]).getDay()];
}

function checkGradeDate_(settings, d) {
  var e = {};
  var grade = str_(d.grade, 41);
  var date = str_(d.date, 10);
  if (!grade) e.grade = 'REQUIRED'; else if (settings.grades.indexOf(grade) < 0) e.grade = 'GRADE_INVALID';
  if (!date) e.date = 'REQUIRED'; else if (!validDate_(date)) e.date = 'DATE_INVALID'; else if (date > today_()) e.date = 'DATE_FUTURE';
  if (hasKeys_(e)) failFields_(e);
  return { grade: grade, date: date };
}

function apiGetAttendance_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var gd = checkGradeDate_(settings, d);
  var t = readTable_(gradeTab_(ss, settings, gd.grade));
  var ci = t.header.indexOf(gd.date);
  var marks = {};
  if (ci >= 0) t.rows.forEach(function (r) { if (r[ci]) marks[r[0]] = r[ci]; });
  var students = loadObjs_(ss, 'Students');
  var list = students.filter(function (s) { return (s.grade === gd.grade && s.status === 'Active') || marks[s.regNo]; })
    .map(function (s) { return { regNo: s.regNo, fullName: s.fullName, gender: s.gender, status: marks[s.regNo] || '' }; })
    .sort(function (a, b) { return a.fullName.localeCompare(b.fullName); });
  return { grade: gd.grade, date: gd.date, saved: ci >= 0, workingDay: settings.workingDays.indexOf(dayOf_(gd.date)) >= 0, students: list };
}

function apiSaveAttendance_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var gd = checkGradeDate_(settings, d);
  var records = d.records && typeof d.records === 'object' ? d.records : {};
  var regNos = Object.keys(records);
  if (!regNos.length) failFields_({ records: 'LIST_REQUIRED' });
  var students = loadObjs_(ss, 'Students');
  var names = {};
  students.forEach(function (s) { names[s.regNo] = s.fullName; });
  regNos.forEach(function (r) {
    if (!names.hasOwnProperty(r)) fail_('STUDENT_NOT_FOUND');
    if (['P', 'A', ''].indexOf(records[r]) < 0) failFields_({ records: 'VALUE_INVALID' });
  });

  var sh = gradeTab_(ss, settings, gd.grade);
  var t = readTable_(sh);
  var header = t.header.length >= 2 ? t.header : ATT_FIXED.slice();
  var dates = header.slice(ATT_FIXED.length);
  if (dates.indexOf(gd.date) < 0) dates.push(gd.date);
  dates.sort();
  var newHeader = ATT_FIXED.concat(dates);
  var rowsByReg = {};
  var order = [];
  t.rows.forEach(function (r) {
    var o = {};
    header.forEach(function (h, i) { o[h] = r[i]; });
    rowsByReg[r[0]] = o;
    order.push(r[0]);
  });
  regNos.forEach(function (r) {
    if (!rowsByReg[r]) { rowsByReg[r] = { RegNo: r }; order.push(r); }
    rowsByReg[r][gd.date] = records[r];
  });
  order.forEach(function (r) { if (names[r]) rowsByReg[r].FullName = names[r]; });
  order.sort(function (a, b) { return String(rowsByReg[a].FullName || '').localeCompare(String(rowsByReg[b].FullName || '')); });
  writeTable_(sh, newHeader, order.map(function (r) {
    return newHeader.map(function (h) { return rowsByReg[r][h] || ''; });
  }));
  var p = 0, a = 0;
  regNos.forEach(function (r) { if (records[r] === 'P') p++; else if (records[r] === 'A') a++; });
  return { grade: gd.grade, date: gd.date, p: p, a: a };
}

function apiDeleteAttendance_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var gd = checkGradeDate_(settings, d);
  var sh = gradeTab_(ss, settings, gd.grade);
  var t = readTable_(sh);
  var ci = t.header.indexOf(gd.date);
  if (ci < ATT_FIXED.length) return {};
  var keep = t.header.map(function (h, i) { return i; }).filter(function (i) { return i !== ci; });
  writeTable_(sh, keep.map(function (i) { return t.header[i]; }), t.rows.map(function (r) {
    return keep.map(function (i) { return r[i]; });
  }));
  return {};
}

function apiAttendanceReport_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var grade = str_(d.grade, 41);
  var month = str_(d.month, 7);
  if (settings.grades.indexOf(grade) < 0) failFields_({ grade: 'GRADE_INVALID' });
  if (!/^\d{4}(-\d{2})?$/.test(month)) failFields_({ month: 'DATE_INVALID' });
  var t = readTable_(gradeTab_(ss, settings, grade));
  var cols = [];
  t.header.forEach(function (h, i) { if (i >= ATT_FIXED.length && h.indexOf(month) === 0) cols.push(i); });
  var students = loadObjs_(ss, 'Students');
  var byReg = {};
  t.rows.forEach(function (r) { byReg[r[0]] = r; });
  var regs = {};
  students.forEach(function (s) { if (s.grade === grade && s.status === 'Active') regs[s.regNo] = s.fullName; });
  t.rows.forEach(function (r) {
    if (cols.some(function (i) { return r[i]; })) regs[r[0]] = regs[r[0]] || r[1];
  });
  var rows = Object.keys(regs).map(function (reg) {
    var r = byReg[reg] || [];
    var m = {}, p = 0, a = 0;
    cols.forEach(function (i) {
      var v = r[i] || '';
      m[t.header[i]] = v;
      if (v === 'P') p++; else if (v === 'A') a++;
    });
    return { regNo: reg, fullName: regs[reg], marks: m, p: p, a: a };
  }).sort(function (x, y) { return x.fullName.localeCompare(y.fullName); });
  return { grade: grade, month: month, dates: cols.map(function (i) { return t.header[i]; }), rows: rows };
}

/* ------------------------------------------------------------------ */
/* Exams                                                               */
/* ------------------------------------------------------------------ */

function apiSaveExam_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var x = cleanExam_(d.exam);
  var e = validateExam_(x, settings);
  if (hasKeys_(e)) failFields_(e);
  var exams = loadObjs_(ss, 'Exams');
  var row = { examId: x.examId, name: x.name, grade: x.grade, year: x.year, term: x.term, date: x.date,
    subjects: joinList_(x.subjects), maxMarks: String(Number(x.maxMarks)), createdAt: '' };
  if (x.examId) {
    var i = exams.map(function (y) { return y.examId; }).indexOf(x.examId);
    if (i < 0) fail_('EXAM_NOT_FOUND');
    row.createdAt = exams[i].createdAt;
    exams[i] = row;
  } else {
    row.examId = newId_('X');
    row.createdAt = nowIso_();
    exams.push(row);
  }
  saveObjs_(ss, 'Exams', exams);
  return { exam: examOut_(row) };
}

function apiDeleteExam_(ctx, d) {
  var ss = ctx.ss;
  var id = str_(d.examId, 20);
  var exams = loadObjs_(ss, 'Exams');
  var keep = exams.filter(function (x) { return x.examId !== id; });
  if (keep.length === exams.length) fail_('EXAM_NOT_FOUND');
  saveObjs_(ss, 'Exams', keep);
  saveObjs_(ss, 'ExamMarks', loadObjs_(ss, 'ExamMarks').filter(function (m) { return m.examId !== id; }));
  return {};
}

function getExam_(ss, id) {
  var ex = loadObjs_(ss, 'Exams').filter(function (x) { return x.examId === id; })[0];
  if (!ex) fail_('EXAM_NOT_FOUND');
  return examOut_(ex);
}

function apiGetExamMarks_(ctx, d) {
  var ss = ctx.ss;
  var ex = getExam_(ss, str_(d.examId, 20));
  var marks = loadObjs_(ss, 'ExamMarks').filter(function (m) { return m.examId === ex.examId; });
  var withMarks = {};
  marks.forEach(function (m) { withMarks[m.regNo] = true; });
  var students = loadObjs_(ss, 'Students')
    .filter(function (s) { return (s.grade === ex.grade && s.status === 'Active') || withMarks[s.regNo]; })
    .map(function (s) { return { regNo: s.regNo, fullName: s.fullName }; })
    .sort(function (a, b) { return a.fullName.localeCompare(b.fullName); });
  return { exam: ex, students: students, marks: marks };
}

function apiSaveExamMarks_(ctx, d) {
  var ss = ctx.ss;
  var ex = getExam_(ss, str_(d.examId, 20));
  var subject = str_(d.subject, 41);
  if (ex.subjects.indexOf(subject) < 0) failFields_({ subject: 'VALUE_INVALID' });
  var entries = Array.isArray(d.entries) ? d.entries : [];
  var max = Number(ex.maxMarks) || 100;
  var students = loadObjs_(ss, 'Students');
  var known = {};
  students.forEach(function (s) { known[s.regNo] = true; });
  var e = {};
  entries.forEach(function (en) {
    var r = str_(en.regNo, 20);
    if (!known[r]) fail_('STUDENT_NOT_FOUND');
    var err = en.absent ? '' : marksError_(en.marks, max);
    if (err) e['marks_' + r] = err;
  });
  if (hasKeys_(e)) failFields_(e);
  var touched = {};
  entries.forEach(function (en) { touched[str_(en.regNo, 20)] = true; });
  var all = loadObjs_(ss, 'ExamMarks').filter(function (m) {
    return !(m.examId === ex.examId && m.subject === subject && touched[m.regNo]);
  });
  var saved = 0;
  entries.forEach(function (en) {
    var r = str_(en.regNo, 20);
    var v = str_(en.marks, 10);
    if (!en.absent && v === '') return;
    all.push({ examId: ex.examId, regNo: r, subject: subject, marks: en.absent ? '' : String(Number(v)), absent: en.absent ? 'Y' : '' });
    saved++;
  });
  saveObjs_(ss, 'ExamMarks', all);
  return { saved: saved };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function apiSaveEvent_(ctx, d) {
  var ss = ctx.ss;
  var settings = getSettings_(ss);
  var x = cleanEvent_(d.event);
  var e = validateEvent_(x, settings);
  if (hasKeys_(e)) failFields_(e);
  var events = loadObjs_(ss, 'Events');
  var row = { eventId: x.eventId, name: x.name, type: x.type, date: x.date, grades: joinList_(x.grades),
    description: x.description, maxMarks: x.maxMarks === '' ? '' : String(Number(x.maxMarks)), createdAt: '' };
  if (x.eventId) {
    var i = events.map(function (y) { return y.eventId; }).indexOf(x.eventId);
    if (i < 0) fail_('EVENT_NOT_FOUND');
    row.createdAt = events[i].createdAt;
    events[i] = row;
  } else {
    row.eventId = newId_('V');
    row.createdAt = nowIso_();
    events.push(row);
  }
  saveObjs_(ss, 'Events', events);
  return { event: eventOut_(row) };
}

function apiDeleteEvent_(ctx, d) {
  var ss = ctx.ss;
  var id = str_(d.eventId, 20);
  var events = loadObjs_(ss, 'Events');
  var keep = events.filter(function (x) { return x.eventId !== id; });
  if (keep.length === events.length) fail_('EVENT_NOT_FOUND');
  saveObjs_(ss, 'Events', keep);
  saveObjs_(ss, 'EventMarks', loadObjs_(ss, 'EventMarks').filter(function (m) { return m.eventId !== id; }));
  return {};
}

function getEvent_(ss, id) {
  var ev = loadObjs_(ss, 'Events').filter(function (x) { return x.eventId === id; })[0];
  if (!ev) fail_('EVENT_NOT_FOUND');
  return eventOut_(ev);
}

function apiGetEventMarks_(ctx, d) {
  var ss = ctx.ss;
  var ev = getEvent_(ss, str_(d.eventId, 20));
  return { event: ev, entries: loadObjs_(ss, 'EventMarks').filter(function (m) { return m.eventId === ev.eventId; }) };
}

/** Replaces the full participant list of an event. */
function apiSaveEventMarks_(ctx, d) {
  var ss = ctx.ss;
  var ev = getEvent_(ss, str_(d.eventId, 20));
  var max = Number(ev.maxMarks) || 0;
  var entries = Array.isArray(d.entries) ? d.entries : [];
  var known = {};
  loadObjs_(ss, 'Students').forEach(function (s) { known[s.regNo] = true; });
  var e = {};
  var seen = {};
  var rows = [];
  entries.forEach(function (en) {
    var r = str_(en.regNo, 20);
    if (!known[r]) fail_('STUDENT_NOT_FOUND');
    if (seen[r]) return;
    seen[r] = true;
    var m = str_(en.marks, 10);
    var err = marksError_(m, max);
    if (err) e['marks_' + r] = err;
    var place = str_(en.place, 40);
    var remarks = str_(en.remarks, 200);
    if (place.length > 40) e['place_' + r] = 'TOO_LONG';
    if (remarks.length > 200) e['remarks_' + r] = 'TOO_LONG';
    rows.push({ eventId: ev.eventId, regNo: r, marks: m === '' ? '' : String(Number(m)), place: place, remarks: remarks });
  });
  if (hasKeys_(e)) failFields_(e);
  var all = loadObjs_(ss, 'EventMarks').filter(function (m) { return m.eventId !== ev.eventId; }).concat(rows);
  saveObjs_(ss, 'EventMarks', all);
  return { entries: rows };
}

/* ------------------------------------------------------------------ */
/* Prefects                                                            */
/* ------------------------------------------------------------------ */

function apiSavePrefect_(ctx, d) {
  var ss = ctx.ss;
  var x = cleanPrefect_(d.prefect);
  var e = validatePrefect_(x);
  if (hasKeys_(e)) failFields_(e);
  if (findStudent_(loadObjs_(ss, 'Students'), x.regNo) < 0) failFields_({ regNo: 'STUDENT_NOT_FOUND' });
  var all = loadObjs_(ss, 'Prefects');
  var clash = all.some(function (p) {
    return p.prefectId !== x.prefectId && p.regNo === x.regNo && p.role === x.role && !p.endDate && !x.endDate;
  });
  if (clash) failFields_({ role: 'PREFECT_ALREADY_ACTIVE' });
  if (x.prefectId) {
    var i = all.map(function (p) { return p.prefectId; }).indexOf(x.prefectId);
    if (i < 0) fail_('NOT_FOUND');
    all[i] = x;
  } else {
    x.prefectId = newId_('P');
    all.push(x);
  }
  saveObjs_(ss, 'Prefects', all);
  return { prefect: x };
}

function apiDeletePrefect_(ctx, d) {
  var ss = ctx.ss;
  var id = str_(d.prefectId, 20);
  var all = loadObjs_(ss, 'Prefects');
  var keep = all.filter(function (p) { return p.prefectId !== id; });
  if (keep.length === all.length) fail_('NOT_FOUND');
  saveObjs_(ss, 'Prefects', keep);
  return {};
}
