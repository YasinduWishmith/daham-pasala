import { t, tc } from '../i18n.js';
import { html, icon } from '../ui.js';
import { store } from '../store.js';
import { fmtDate, todayIso, nextWorkingDay, pct, relDay, num } from '../format.js';
import { pctBar } from './common.js';

export async function page({ root }) {
  const d = store.data;
  const s = d.settings;
  const active = d.students.filter((x) => x.status === 'Active');
  const today = todayIso();
  const next = nextWorkingDay(s.workingDays);
  const curPrefects = d.prefects.filter((p) => !p.endDate && d.students.some((x) => x.regNo === p.regNo));
  const upcoming = d.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const recentExams = d.exams.slice().sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)).slice(0, 3);
  const byGrade = s.grades.map((g) => {
    const n = active.filter((x) => x.grade === g).length;
    const last = d.attendance.lastByGrade[g];
    return { g, n, last, p: last ? pct(last.p, last.a) : null };
  });
  const isWorkingToday = next === today;

  root.innerHTML = String(html`
    <div class="card" style="background:linear-gradient(135deg,var(--primary),#b8452f);color:#fff;border:0">
      <div class="small" style="opacity:.85">${fmtDate(today, { weekday: 'long', month: 'long' })}</div>
      <h1 style="margin:.25rem 0 .5rem;color:#fff">${d.school.name}</h1>
      <div class="small" style="opacity:.92">${next ? (isWorkingToday ? t('dash.todayWorking') : t('dash.nextWorking', { date: fmtDate(next, { weekday: 'long', month: 'long' }) })) : t('dash.noWorkingDays')}</div>
    </div>

    <div class="grid-2 mt">
      <a class="btn primary" href="#/attendance">${icon('checkSquare')}${t('dash.takeAttendance')}</a>
      <a class="btn outline" href="#/students/new">${icon('plus')}${t('dash.addStudent')}</a>
      <a class="btn outline" href="#/exams">${icon('book')}${t('dash.enterMarks')}</a>
      <a class="btn outline" href="#/events">${icon('star')}${t('dash.events')}</a>
    </div>

    <div class="grid-auto mt">
      <a class="stat card-link" href="#/students"><div class="num">${num(active.length)}</div><div class="lbl">${t('dash.activeStudents')}</div></a>
      <div class="stat"><div class="num">${num(s.grades.length)}</div><div class="lbl">${t('dash.grades')}</div></div>
      <a class="stat card-link" href="#/prefects"><div class="num">${num(curPrefects.length)}</div><div class="lbl">${t('dash.prefects')}</div></a>
      <a class="stat card-link" href="#/events"><div class="num">${num(d.events.length)}</div><div class="lbl">${t('dash.eventsCount')}</div></a>
    </div>

    <h2 class="mt">${t('dash.byGrade')}</h2>
    ${s.grades.length ? html`<div class="list">${byGrade.map((x) => html`
      <a class="list-item" href="#/students?grade=${encodeURIComponent(x.g)}">
        <div class="main"><div class="title">${x.g}</div>
          <div class="sub">${t('dash.studentsN', { n: num(x.n) })}${x.last ? html` · ${t('dash.lastAttendance', { date: relDay(x.last.date), p: x.p })}` : html` · ${t('dash.noAttendanceYet')}`}</div>
          ${x.p !== null ? html`<div style="margin-top:6px">${pctBar(x.p)}</div>` : ''}
        </div>${icon('chevron', 'chev')}</a>`)}</div>` : ''}

    <div class="row between mt"><h2 style="margin:0">${t('dash.upcomingEvents')}</h2><a href="#/events" class="small">${t('common.viewAll')}</a></div>
    ${upcoming.length ? html`<div class="list mt">${upcoming.map((e) => html`
      <a class="list-item" href="#/events/${encodeURIComponent(e.eventId)}">
        <div class="main"><div class="title">${e.name}</div><div class="sub">${tc('etype', e.type)} · ${fmtDate(e.date, { weekday: 'short' })}</div></div>${icon('chevron', 'chev')}</a>`)}</div>`
      : html`<p class="muted small mt">${t('dash.noUpcoming')}</p>`}

    ${recentExams.length ? html`<div class="row between mt"><h2 style="margin:0">${t('dash.recentExams')}</h2><a href="#/exams" class="small">${t('common.viewAll')}</a></div>
      <div class="list mt">${recentExams.map((e) => html`
      <a class="list-item" href="#/exams/${encodeURIComponent(e.examId)}">
        <div class="main"><div class="title">${e.name}</div><div class="sub">${e.grade} · ${e.year}${e.term ? ' · ' + t('exams.termN', { n: e.term }) : ''}</div></div>${icon('chevron', 'chev')}</a>`)}</div>` : ''}
  `);
}
