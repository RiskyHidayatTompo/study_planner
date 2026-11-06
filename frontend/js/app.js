// Smart Study Planner — MoonKnight Edition
// Main application logic (vanilla JS SPA)

const DAY_NAMES = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
const SCHEDULE_COLORS = ['#4f9eff','#7ec8ff','#34d399','#f5c451','#ff4d6d','#a78bfa','#f472b6'];
const CATEGORY_LABEL = { coding:'Coding', laporan:'Laporan', presentasi:'Presentasi', baca:'Baca Materi', lainnya:'Lainnya' };

const state = {
  user: null,
  tasks: [],
  schedules: [],
  recommendation: null,
  taskFilter: 'semua',
  charts: {},
  activity: { sessions: [], progress: [], claims: [] },
};

/* ============================ Helpers ============================ */
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type ? 'toast--' + type : ''}`;
  el.innerHTML = msg;
  $('#toastStack').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function fmtCountdown(deadline) {
  if (!deadline) return { text: 'Tanpa deadline', urgent: false };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: '⚠️ Lewat deadline', urgent: true };
  const hours = diff / 36e5;
  if (hours < 24) return { text: `⏰ ${Math.floor(hours)} jam lagi`, urgent: hours <= 6 };
  const days = Math.floor(hours / 24);
  return { text: `📅 ${days} hari lagi`, urgent: days <= 1 };
}

// ISO (UTC) dari database -> format "YYYY-MM-DDTHH:mm" waktu lokal untuk <input type="datetime-local">
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDeadlineShort(deadline) {
  if (!deadline) return '—';
  const d = new Date(deadline);
  return d.toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

/* ============================ Auth ============================ */
function initAuthTabs() {
  $all('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $all('.auth-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const target = tab.dataset.tab;
      $('#loginForm').classList.toggle('is-hidden', target !== 'login');
      $('#registerForm').classList.toggle('is-hidden', target !== 'register');
    });
  });
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $('#loginError').textContent = '';
  try {
    const { user } = await Api.login({ email: fd.get('email'), password: fd.get('password') });
    await enterApp(user);
  } catch (err) { $('#loginError').textContent = err.message; }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  $('#registerError').textContent = '';
  try {
    const { user } = await Api.register({
      username: fd.get('username'), email: fd.get('email'), password: fd.get('password'),
    });
    await enterApp(user);
  } catch (err) { $('#registerError').textContent = err.message; }
});

$('#demoLoginBtn').addEventListener('click', async () => {
  const demo = { email: 'demo@moonknight.app', password: 'demo123', username: 'DemoKnight' };
  try {
    let res;
    try { res = await Api.login({ email: demo.email, password: demo.password }); }
    catch { res = await Api.register(demo); }
    await enterApp(res.user);
  } catch (err) { toast(err.message, 'error'); }
});

$('#logoutBtn').addEventListener('click', async () => {
  await Api.logout();
  location.reload();
});

async function enterApp(user) {
  state.user = user;
  $('#authGate').classList.add('is-hidden');
  $('#appShell').classList.remove('is-hidden');
  await loadAllData();
  renderAll();
}

/* ============================ Data loading ============================ */
async function loadAllData() {
  const [taskRes, schedRes] = await Promise.all([Api.getTasks(), Api.getSchedules()]);
  state.tasks = taskRes.tasks;
  state.recommendation = taskRes.recommendation;
  state.schedules = schedRes.schedules;
  state.activity = await Api.getActivity();
}

function renderAll() {
  renderTopXp();
  renderDashboard();
  renderWeekGrid();
  renderTasks();
  renderProfile();
  renderCharts();
  renderFocusPage();
}

/* ============================ Top XP ring ============================ */
function renderTopXp() {
  const u = state.user;
  $('#topLevel').textContent = u.level;
  $('#topRank').textContent = u.rank;
  $('#topXp').textContent = u.xp;
  const pct = Math.min(1, u.xpIntoLevel / u.xpNeeded);
  const circumference = 2 * Math.PI * 27;
  $('#xpRingFill').style.strokeDasharray = circumference;
  $('#xpRingFill').style.strokeDashoffset = circumference * (1 - pct);
}

/* ============================ Dashboard ============================ */
function renderDashboard() {
  const done = state.tasks.filter(t => t.status === 'selesai').length;
  const proses = state.tasks.filter(t => t.status === 'proses').length;
  const belum = state.tasks.filter(t => t.status === 'belum').length;
  const total = state.tasks.length || 1;

  $('#statDone').textContent = done;
  $('#statProses').textContent = proses;
  $('#statBelum').textContent = belum;
  $('#statDoneBar').style.width = `${(done/total)*100}%`;

  // AI recommendation
  const rec = state.recommendation;
  $('#aiRecText').textContent = rec
    ? `🔥 Kerjakan ini sekarang: "${rec.title}" — ${CATEGORY_LABEL[rec.category] || rec.category}${rec.deadline ? ' · ' + fmtCountdown(rec.deadline).text : ''}`
    : 'Tidak ada tugas aktif. Tambahkan tugas untuk mulai bertarung melawan deadline.';

  // Today schedule
  const todayIdx = (new Date().getDay() + 6) % 7; // Senin=0
  const todayItems = state.schedules.filter(s => s.day_of_week === todayIdx).sort((a,b)=>a.start_time.localeCompare(b.start_time));
  const todayWrap = $('#todaySchedule');
  todayWrap.innerHTML = todayItems.length ? todayItems.map(s => `
    <div class="sched-row" style="border-left-color:${s.color}">
      <div><strong>${escapeHtml(s.course_name)}</strong><br><span class="muted">${escapeHtml(s.room || 'Ruang tidak diketahui')}</span></div>
      <span class="muted">${s.start_time} - ${s.end_time}</span>
    </div>`).join('') : `<p class="empty-state">Tidak ada kelas hari ini. Waktunya fokus tugas 🌙</p>`;

  // Upcoming deadlines
  const upcoming = state.tasks
    .filter(t => t.status !== 'selesai' && t.deadline)
    .sort((a,b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);
  const deadlineWrap = $('#upcomingDeadlines');
  deadlineWrap.innerHTML = upcoming.length ? upcoming.map(t => {
    const c = fmtCountdown(t.deadline);
    return `<div class="deadline-row">
      <div><strong>${escapeHtml(t.title)}</strong><br><span class="muted">${CATEGORY_LABEL[t.category] || t.category}</span></div>
      <span class="countdown ${c.urgent ? 'is-urgent' : ''}">${c.text}</span>
    </div>`;
  }).join('') : `<p class="empty-state">Tidak ada deadline mendesak. Tetap waspada 🛡️</p>`;
}

function escapeHtml(str='') {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================ Jadwal (week grid) ============================ */
function renderWeekGrid() {
  const grid = $('#weekGrid');
  grid.innerHTML = DAY_NAMES.map((name, idx) => {
    const items = state.schedules.filter(s => s.day_of_week === idx).sort((a,b)=>a.start_time.localeCompare(b.start_time));
    return `<div class="day-col">
      <p class="day-col__label">${name}</p>
      ${items.map(s => `
        <div class="sched-chip" style="background:${s.color}" data-id="${s.id}">
          ${escapeHtml(s.course_name)}
          <small>${s.start_time}–${s.end_time}${s.room ? ' · ' + escapeHtml(s.room) : ''}</small>
        </div>`).join('') || ''}
    </div>`;
  }).join('');

  $all('.sched-chip', grid).forEach(chip => {
    chip.addEventListener('click', () => openScheduleModal(state.schedules.find(s => s.id == chip.dataset.id)));
  });
}

function buildColorSwatches(selected) {
  const wrap = $('#colorSwatches');
  wrap.innerHTML = SCHEDULE_COLORS.map(c =>
    `<div class="swatch ${c === selected ? 'is-active' : ''}" style="background:${c}" data-color="${c}"></div>`
  ).join('');
  $all('.swatch', wrap).forEach(sw => {
    sw.addEventListener('click', () => {
      $all('.swatch', wrap).forEach(s => s.classList.remove('is-active'));
      sw.classList.add('is-active');
    });
  });
}

function openScheduleModal(schedule = null) {
  const form = $('#scheduleForm');
  form.reset();
  form.id.value = schedule?.id || '';
  if (schedule) {
    form.course_name.value = schedule.course_name;
    form.day_of_week.value = schedule.day_of_week;
    form.start_time.value = schedule.start_time;
    form.end_time.value = schedule.end_time;
    form.room.value = schedule.room || '';
  }
  buildColorSwatches(schedule?.color || SCHEDULE_COLORS[0]);
  openModal('scheduleModal');
}

$('#addScheduleBtn').addEventListener('click', () => openScheduleModal());

$('#scheduleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const activeSwatch = $('.swatch.is-active');
  const payload = {
    course_name: fd.get('course_name'),
    day_of_week: Number(fd.get('day_of_week')),
    start_time: fd.get('start_time'),
    end_time: fd.get('end_time'),
    room: fd.get('room'),
    color: activeSwatch ? activeSwatch.dataset.color : SCHEDULE_COLORS[0],
  };
  const id = fd.get('id');
  try {
    if (id) await Api.updateSchedule(id, payload);
    else await Api.createSchedule(payload);
    closeModal();
    await loadAllData();
    renderWeekGrid();
    renderDashboard();
    toast('Jadwal tersimpan ✅');
  } catch (err) { toast(err.message, 'error'); }
});

/* ============================ Tugas ============================ */
function openTaskModal(task = null) {
  const form = $('#taskForm');
  form.reset();
  form.id.value = task?.id || '';
  if (task) {
    form.title.value = task.title;
    form.category.value = task.category;
    form.priority.value = task.priority;
    form.deadline.value = toLocalInput(task.deadline);
  }
  openModal('taskModal');
}

$('#addTaskBtn').addEventListener('click', () => openTaskModal());

$('#taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    title: fd.get('title'),
    category: fd.get('category'),
    priority: fd.get('priority'),
    deadline: fd.get('deadline') || null,
  };
  const id = fd.get('id');
  try {
    if (id) await Api.updateTask(id, payload);
    else await Api.createTask(payload);
    closeModal();
    await loadAllData();
    renderDashboard(); renderTasks(); renderCharts();
    toast('Tugas tersimpan ✅');
  } catch (err) { toast(err.message, 'error'); }
});

$all('.chip[data-filter]').forEach(chip => {
  chip.addEventListener('click', () => {
    $all('.chip[data-filter]').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    state.taskFilter = chip.dataset.filter;
    renderTasks();
  });
});

function renderTasks() {
  let items = [...state.tasks];
  if (state.taskFilter === 'urgent') items = items.filter(t => t.priority === 'urgent');
  else if (state.taskFilter !== 'semua') items = items.filter(t => t.status === state.taskFilter);

  items.sort((a,b) => {
    if (a.status === 'selesai' && b.status !== 'selesai') return 1;
    if (b.status === 'selesai' && a.status !== 'selesai') return -1;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  const wrap = $('#taskList');
  wrap.innerHTML = items.length ? items.map(t => {
    const c = fmtCountdown(t.deadline);
    return `<div class="task-item ${t.status === 'selesai' ? 'is-selesai' : ''}" data-id="${t.id}">
      <button class="task-check ${t.status === 'selesai' ? 'is-checked' : ''}" data-action="toggle" title="Tandai selesai">
        <i class="fa-solid fa-check"></i>
      </button>
      <div class="task-item__body">
        <p class="task-item__title">${escapeHtml(t.title)}</p>
        <div class="task-item__meta">
          <span class="badge-tag badge-tag--${t.priority === 'urgent' ? 'urgent' : 'normal'}">${t.priority === 'urgent' ? 'URGENT' : 'NORMAL'}</span>
          <span class="badge-tag badge-tag--status">${CATEGORY_LABEL[t.category] || t.category}</span>
          <span class="countdown ${c.urgent ? 'is-urgent' : ''}">${c.text}</span>
          <span>+${t.xp_reward} XP</span>
        </div>
      </div>
      <div class="task-item__actions">
        <button class="icon-btn" data-action="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn" data-action="delete" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('') : `<p class="empty-state">Belum ada tugas pada filter ini. Tambahkan tugas baru!</p>`;

  $all('.task-item', wrap).forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleTaskStatus(id));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openTaskModal(state.tasks.find(t => t.id == id)));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTask(id));
  });
}

async function toggleTaskStatus(id) {
  const task = state.tasks.find(t => t.id == id);
  const nextStatus = task.status === 'selesai' ? 'belum' : 'selesai';
  try {
    const { user, leveledUp } = await Api.updateTaskStatus(id, nextStatus);
    state.user = user;
    await loadAllData();
    renderAll();
    if (nextStatus === 'selesai') {
      toast(`+${task.xp_reward} XP diperoleh! ⚡`, 'xp');
    }
    if (leveledUp) showLevelUp(user.level);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('Hapus tugas ini?')) return;
  try {
    await Api.deleteTask(id);
    await loadAllData();
    renderDashboard(); renderTasks(); renderCharts();
    toast('Tugas dihapus');
  } catch (err) { toast(err.message, 'error'); }
}

function showLevelUp(level) {
  $('#levelupLevel').textContent = `Level ${level}`;
  $('#levelupOverlay').classList.remove('is-hidden');
}
$('#levelupClose').addEventListener('click', () => $('#levelupOverlay').classList.add('is-hidden'));

/* ============================ Profile ============================ */
function renderProfile() {
  const u = state.user;
  $('#profileUsername').textContent = u.username;
  $('#profileRank').textContent = `${u.rank} · Level ${u.level}`;
  const pct = Math.min(100, (u.xpIntoLevel / u.xpNeeded) * 100);
  $('#profileXpBar').style.width = pct + '%';
  $('#profileXpText').textContent = `${u.xpIntoLevel} / ${u.xpNeeded} XP menuju level berikutnya`;

  const img = $('#profileAvatarImg');
  const svg = $('#profileAvatarSvg');
  if (u.avatar_url) {
    img.src = u.avatar_url;
    img.classList.remove('is-hidden');
    svg.classList.add('is-hidden');
  } else {
    img.classList.add('is-hidden');
    svg.classList.remove('is-hidden');
  }

  const allBadges = [
    { id:'first_blood', name:'Langkah Pertama', desc:'Selesaikan tugas pertama', icon:'fa-shoe-prints' },
    { id:'grinder', name:'Sang Penggiat', desc:'10 tugas selesai', icon:'fa-fire' },
    { id:'task_master', name:'Task Master', desc:'50 tugas selesai', icon:'fa-crown' },
    { id:'no_deadline_missed', name:'No Deadline Missed', desc:'Tak pernah telat', icon:'fa-shield-halved' },
    { id:'master_rank', name:'Moon Master', desc:'Capai rank Master', icon:'fa-moon' },
  ];
  const earnedIds = new Set(u.badges.map(b => b.id));
  $('#badgeList').innerHTML = allBadges.map(b => `
    <div class="badge-item ${earnedIds.has(b.id) ? '' : 'is-locked'}">
      <i class="fa-solid ${b.icon}"></i>
      <p>${b.name}</p>
      <small>${b.desc}</small>
    </div>`).join('');
}

$('#avatarBtn').addEventListener('click', () => $('#avatarInput').click());
$('#avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const btn = $('#avatarBtn');
  btn.disabled = true;
  try {
    const { avatar_url } = await Api.uploadAvatar(file);
    state.user.avatar_url = avatar_url;
    renderProfile();
    toast('Foto profil diperbarui ✅');
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
});

/* ============================ Charts ============================ */
function renderCharts() {
  const done = state.tasks.filter(t => t.status === 'selesai').length;
  const proses = state.tasks.filter(t => t.status === 'proses').length;
  const belum = state.tasks.filter(t => t.status === 'belum').length;

  const chartColors = { grid:'#223047', text:'#c7cedb' };

  destroyChart('status');
  state.charts.status = new Chart($('#statusChart'), {
    type: 'doughnut',
    data: {
      labels: ['Selesai','Proses','Belum'],
      datasets: [{ data:[done,proses,belum], backgroundColor:['#34d399','#f5c451','#ff4d6d'], borderWidth:0 }]
    },
    options: { plugins:{ legend:{ labels:{ color: chartColors.text } } } }
  });

  const catMap = {};
  state.tasks.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + 1; });
  destroyChart('category');
  state.charts.category = new Chart($('#categoryChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(catMap).map(k => CATEGORY_LABEL[k] || k),
      datasets: [{ label:'Jumlah Tugas', data:Object.values(catMap), backgroundColor:'#4f9eff', borderRadius:6 }]
    },
    options: {
      plugins:{ legend:{ display:false } },
      scales:{ x:{ ticks:{ color:chartColors.text }, grid:{ color:chartColors.grid } }, y:{ ticks:{ color:chartColors.text, precision:0 }, grid:{ color:chartColors.grid } } }
    }
  });

  fetchAndRenderXpChart(chartColors);
}

async function fetchAndRenderXpChart(chartColors) {
  try {
    const stats = await Api.getStats();
    const labels = [];
    const data = [];
    const map = new Map(stats.xpLast7Days.map(r => [r.d, r.xp]));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      labels.push(d.toLocaleDateString('id-ID', { weekday:'short' }));
      data.push(map.get(key) || 0);
    }
    destroyChart('xp');
    state.charts.xp = new Chart($('#xpChart'), {
      type: 'line',
      data: { labels, datasets: [{ label:'XP', data, borderColor:'#7ec8ff', backgroundColor:'rgba(126,200,255,.15)', fill:true, tension:.35 }] },
      options: {
        plugins:{ legend:{ display:false } },
        scales:{ x:{ ticks:{ color:chartColors.text }, grid:{ color:chartColors.grid } }, y:{ ticks:{ color:chartColors.text, precision:0 }, grid:{ color:chartColors.grid } } }
      }
    });
  } catch { /* silent */ }
}

function destroyChart(key) { if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; } }

/* ============================ Focus, Misi, Streak ============================ */
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const QUESTS = [
  { id: 'tasks2',  title: 'Selesaikan 2 tugas hari ini', xp: 30, max: 2 },
  { id: 'focus30', title: 'Belajar selama 30 menit',     xp: 30, max: 30 },
  { id: 'ontime',  title: 'Selesaikan 1 tugas sebelum deadline', xp: 40, max: 1 },
];

function dailyStats() {
  const today = dayKey(new Date()), { sessions, progress } = state.activity;
  const done = progress.filter(r => r.event === 'task_completed' && dayKey(r.created_at) === today);
  return {
    tasks2: done.length,
    focus30: sessions.filter(s => dayKey(s.created_at) === today).reduce((n, s) => n + s.minutes, 0),
    ontime: done.filter(r => { const t = state.tasks.find(x => x.id === r.task_id); return t && t.deadline && new Date(t.deadline) >= new Date(r.created_at); }).length,
  };
}

// hari aktif = ada sesi fokus atau tugas selesai
function activityByDay() {
  const m = {};
  state.activity.sessions.forEach(s => { const k = dayKey(s.created_at); m[k] = (m[k] || 0) + s.minutes; });
  state.activity.progress.filter(r => r.event === 'task_completed').forEach(r => { const k = dayKey(r.created_at); m[k] = (m[k] || 0) + 15; });
  return m;
}

function calcStreak(byDay) {
  const day = n => dayKey(new Date(Date.now() - n * 864e5));
  let now = 0, i = byDay[day(0)] ? 0 : 1;           // hari ini belum belajar -> streak masih hidup sampai besok
  while (byDay[day(i)]) { now++; i++; }
  let best = 0, run = 0;
  for (let n = 119; n >= 0; n--) { run = byDay[day(n)] ? run + 1 : 0; best = Math.max(best, run); }
  return { now, best: Math.max(best, now) };
}

function renderFocusPage() {
  const stats = dailyStats(), today = dayKey(new Date());
  const claimed = new Set(state.activity.claims.filter(c => c.day === today).map(c => c.quest_id));
  $('#questList').innerHTML = QUESTS.map(q => {
    const val = Math.min(stats[q.id], q.max), ready = stats[q.id] >= q.max, got = claimed.has(q.id);
    return `<div class="quest ${got ? 'is-done' : ''}"><div class="quest__info"><strong>${q.title}</strong>
      <div class="quest__bar"><span style="width:${val / q.max * 100}%"></span></div>
      <small class="muted">${val}/${q.max} · +${q.xp} XP</small></div>
      <button type="button" class="btn btn--primary" data-quest="${q.id}" ${ready && !got ? '' : 'disabled'}>${got ? 'Diklaim ✓' : 'Klaim'}</button></div>`;
  }).join('');
  $all('[data-quest]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { const r = await Api.claimQuest(b.dataset.quest, today); state.user = r.user; renderTopXp(); renderProfile(); await loadAllData(); renderFocusPage(); toast(`Misi selesai! +${r.gained} XP 🎯`); }
    catch (e) { toast(e.message, 'error'); renderFocusPage(); }
  }));

  const byDay = activityByDay(), { now, best } = calcStreak(byDay);
  $('#streakNow').textContent = now; $('#streakBest').textContent = best;
  $('#streakReminder').classList.toggle('is-hidden', !!byDay[today]);
  let cells = '';
  for (let n = 27; n >= 0; n--) {
    const k = dayKey(new Date(Date.now() - n * 864e5)), v = byDay[k] || 0, lvl = v === 0 ? 0 : v < 30 ? 1 : v < 60 ? 2 : 3;
    cells += `<span class="heat__cell lv${lvl}" title="${k}: ${v} poin aktivitas"></span>`;
  }
  $('#heatGrid').innerHTML = cells;

  const weekAgo = Date.now() - 7 * 864e5;
  $('#weekMinutes').textContent = state.activity.sessions.filter(s => new Date(s.created_at) >= weekAgo).reduce((n, s) => n + s.minutes, 0);
  $('#focusHistory').innerHTML = state.activity.sessions.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
    .map(s => `<li><span>${new Date(s.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><strong>${s.minutes} menit</strong></li>`).join('')
    || '<li class="muted">Belum ada sesi. Mulai fokus pertamamu!</li>';
}

/* ---- Timer Pomodoro (berbasis waktu akhir, tetap akurat walau tab di background) ---- */
const timer = { mode: 'focus', endAt: null, remaining: 25 * 60, tick: null };
const minsOf = id => Math.max(1, Math.min(+$(id).value || 25, id === '#breakMin' ? 60 : 180));
const fmtClock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function timerReset() {
  clearInterval(timer.tick); timer.tick = null; timer.endAt = null;
  timer.remaining = (timer.mode === 'focus' ? minsOf('#focusMin') : minsOf('#breakMin')) * 60;
  $('#focusTime').textContent = fmtClock(timer.remaining);
  $('#focusStart').textContent = 'Mulai';
  $('#focusLabel').textContent = timer.mode === 'focus' ? 'Siap belajar' : 'Waktunya istirahat';
  document.title = 'Smart Study Planner — MoonKnight';
}

async function timerDone() {
  const wasFocus = timer.mode === 'focus', mins = minsOf('#focusMin');
  timerReset();
  if (wasFocus) {
    try { const r = await Api.finishFocus(mins); state.user = r.user; renderTopXp(); renderProfile(); await loadAllData(); renderFocusPage(); toast(`Sesi selesai! +${r.gained} XP 📚`); }
    catch (e) { toast(e.message, 'error'); }
    setMode('break');
  } else { toast('Istirahat selesai. Siap fokus lagi? 🌙'); setMode('focus'); }
}

function setMode(m) {
  timer.mode = m;
  $all('[data-fmode]').forEach(c => c.classList.toggle('is-active', c.dataset.fmode === m));
  timerReset();
}

function timerToggle() {
  if (timer.tick) { timer.remaining = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000)); clearInterval(timer.tick); timer.tick = null; $('#focusStart').textContent = 'Lanjut'; $('#focusLabel').textContent = 'Dijeda'; return; }
  timer.endAt = Date.now() + timer.remaining * 1000;
  $('#focusStart').textContent = 'Jeda'; $('#focusLabel').textContent = timer.mode === 'focus' ? 'Sedang fokus…' : 'Istirahat…';
  timer.tick = setInterval(() => {
    const left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    $('#focusTime').textContent = fmtClock(left); document.title = `${fmtClock(left)} · Fokus`;
    if (left <= 0) timerDone();
  }, 250);
}

$('#focusStart').addEventListener('click', timerToggle);
$('#focusReset').addEventListener('click', timerReset);
$all('[data-fmode]').forEach(c => c.addEventListener('click', () => setMode(c.dataset.fmode)));
['#focusMin', '#breakMin'].forEach(id => $(id).addEventListener('change', () => { if (!timer.tick) timerReset(); }));
$('#focusZen').addEventListener('click', () => $('#focusCard').classList.toggle('is-zen'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#focusCard').classList.remove('is-zen'); });

/* ============================ Navigation ============================ */
const VIEW_TITLES = {
  dashboard: ['Dashboard','Ringkasan aktivitas malam ini'],
  jadwal: ['Jadwal Kuliah','Atur kelasmu minggu ini'],
  tugas: ['Tugas','Kalahkan deadline satu per satu'],
  fokus: ['Fokus & Misi','Belajar, selesaikan misi, jaga streak'],
  statistik: ['Statistik','Pantau progres perjuanganmu'],
  profile: ['Profile','Level, rank, dan pencapaianmu'],
};

$all('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    $all('.nav-item').forEach(i => i.classList.remove('is-active'));
    item.classList.add('is-active');
    const view = item.dataset.view;
    $all('.view').forEach(v => v.classList.remove('is-active'));
    $(`#view-${view}`).classList.add('is-active');
    const [title, sub] = VIEW_TITLES[view];
    $('#viewTitle').textContent = title;
    $('#viewSubtitle').textContent = sub;
  });
});

/* ============================ Modal helpers ============================ */
function openModal(id) {
  $('#modalBackdrop').classList.remove('is-hidden');
  $all('.modal').forEach(m => m.classList.remove('is-open'));
  $(`#${id}`).classList.add('is-open');
}
function closeModal() {
  $('#modalBackdrop').classList.add('is-hidden');
  $all('.modal').forEach(m => m.classList.remove('is-open'));
}
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
$all('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));

/* ============================ Spotify / Fokus Audio ============================ */
// Pemutar mengambang. Iframe hanya dibuat saat pertama kali dibuka, dan TIDAK dihapus saat
// panel disembunyikan, sehingga musik tetap berjalan sambil kamu pindah halaman.
const audio = { playlist: $('[data-playlist]').dataset.playlist, loaded: false };

function renderSpotify() {
  $('#spotifyEmbedWrap').innerHTML =
    `<iframe title="Pemutar Spotify" style="border-radius:12px;border:0" ` +
    `src="https://open.spotify.com/embed/playlist/${audio.playlist}?utm_source=generator&theme=0" ` +
    `width="100%" height="352" allowfullscreen ` +
    `allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  audio.loaded = true;
}

function setAudioDock(open) {
  const dock = $('#audioDock');
  dock.classList.toggle('is-collapsed', !open);
  dock.inert = !open;
  dock.setAttribute('aria-hidden', String(!open));
  const toggle = $('#audioFab');
  toggle.classList.toggle('is-active', open);
  toggle.setAttribute('aria-expanded', String(open));
  if (open && !audio.loaded) renderSpotify();
}

$('#audioFab').addEventListener('click', () => setAudioDock($('#audioDock').classList.contains('is-collapsed')));
$('#audioClose').addEventListener('click', () => setAudioDock(false));
$all('[data-playlist]').forEach(chip => {
  chip.addEventListener('click', () => {
    if (chip.dataset.playlist === audio.playlist && audio.loaded) return;
    $all('[data-playlist]').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    audio.playlist = chip.dataset.playlist;
    renderSpotify();
  });
});

/* ============================ Boot ============================ */
initAuthTabs();

(async function boot() {
  if (!Api.isConfigured) {
    $('#loginError').textContent = 'Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di js/config.js.';
    return;
  }
  try {
    const { user } = await Api.me();
    await enterApp(user);
  } catch {
    // belum login — tampilkan auth gate (default)
  }
})();
