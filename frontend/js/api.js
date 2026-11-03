// Lapisan komunikasi ke Supabase (Auth + Postgres + Storage).
// Antarmuka `Api` dibuat sama seperti versi Express lama, jadi app.js hampir tidak berubah.
(function () {
  const cfg = window.APP_CONFIG || {};
  const isConfigured =
    !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR-PROJECT') && !cfg.SUPABASE_ANON_KEY.includes('YOUR-ANON');

  const sb = isConfigured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const AVATAR_BUCKET = 'avatars';
  const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  function requireClient() {
    if (!sb) throw new Error('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di js/config.js.');
    return sb;
  }

  // Terjemahkan pesan error Supabase ke bahasa Indonesia
  function friendly(err) {
    const msg = (err && err.message) || String(err);
    if (/invalid login credentials/i.test(msg)) return 'Email atau password salah.';
    if (/already registered|already been registered/i.test(msg)) return 'Email sudah terdaftar.';
    if (/email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Cek inbox kamu.';
    if (/password should be at least/i.test(msg)) return 'Password minimal 6 karakter.';
    if (/rate limit|too many/i.test(msg)) return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
    if (/failed to fetch|networkerror/i.test(msg)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
    return msg;
  }

  async function run(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(friendly(error));
    return data;
  }

  function toUser(profile, authUser) {
    const { level, xpIntoLevel, xpNeeded } = Gamify.calcLevel(profile.xp);
    return {
      id: profile.id,
      username: profile.username,
      email: authUser ? authUser.email : '',
      xp: profile.xp,
      level, xpIntoLevel, xpNeeded,
      rank: Gamify.rankFromLevel(level),
      badges: profile.badges || [],
      avatar_url: profile.avatar_url || null,
      role: profile.role,
    };
  }

  async function loadUser() {
    const client = requireClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('Belum login.');
    const profile = await run(client.from('profiles').select('*').eq('id', session.user.id).single());
    return toUser(profile, session.user);
  }

  // <input type="datetime-local"> memberi waktu lokal tanpa zona -> simpan sebagai ISO (UTC)
  function normDeadline(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d.toISOString();
  }

  function pick(obj, keys) {
    const out = {};
    keys.forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
    return out;
  }

  const TASK_FIELDS = ['title', 'category', 'priority', 'deadline', 'xp_reward'];
  const SCHEDULE_FIELDS = ['course_name', 'day_of_week', 'start_time', 'end_time', 'room', 'color'];

  const Api = {
    isConfigured,

    /* ---------------- Auth ---------------- */
    async register({ username, email, password }) {
      const client = requireClient();
      if (!username || !email || !password) throw new Error('Username, email, dan password wajib diisi.');
      if (password.length < 6) throw new Error('Password minimal 6 karakter.');
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { username } },
      });
      if (error) throw new Error(friendly(error));
      // Email yang sudah terdaftar: Supabase tidak mengirim error, tapi identities kosong
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('Email sudah terdaftar.');
      }
      if (!data.session) {
        throw new Error('Akun dibuat! Cek email kamu untuk konfirmasi, lalu masuk.');
      }
      return { user: await loadUser() };
    },

    async login({ email, password }) {
      const client = requireClient();
      const { error } = await client.auth.signInWithPassword({ email, password: password || '' });
      if (error) throw new Error(friendly(error));
      return { user: await loadUser() };
    },

    async logout() {
      if (!sb) return { ok: true };
      await sb.auth.signOut();
      return { ok: true };
    },

    async me() { return { user: await loadUser() }; },

    /* ---------------- Jadwal ---------------- */
    async getSchedules() {
      const rows = await run(requireClient().from('schedules').select('*')
        .order('day_of_week').order('start_time'));
      return { schedules: rows };
    },
    async createSchedule(payload) {
      const body = pick(payload, SCHEDULE_FIELDS);
      if (!body.course_name || body.day_of_week === undefined || !body.start_time || !body.end_time) {
        throw new Error('Data jadwal tidak lengkap.');
      }
      const row = await run(requireClient().from('schedules').insert(body).select().single());
      return { schedule: row };
    },
    async updateSchedule(id, payload) {
      const row = await run(requireClient().from('schedules')
        .update(pick(payload, SCHEDULE_FIELDS)).eq('id', id).select().single());
      return { schedule: row };
    },
    async deleteSchedule(id) {
      await run(requireClient().from('schedules').delete().eq('id', id));
      return { ok: true };
    },

    /* ---------------- Tugas ---------------- */
    async getTasks() {
      const rows = await run(requireClient().from('tasks').select('*')
        .order('deadline', { ascending: true, nullsFirst: false }));
      return { tasks: rows, recommendation: Gamify.recommendTask(rows) };
    },
    async createTask(payload) {
      if (!payload.title) throw new Error('Judul tugas wajib diisi.');
      const body = pick(payload, TASK_FIELDS);
      body.deadline = normDeadline(payload.deadline);
      const row = await run(requireClient().from('tasks').insert(body).select().single());
      return { task: row };
    },
    async updateTask(id, payload) {
      const body = pick(payload, TASK_FIELDS);
      if ('deadline' in body) body.deadline = normDeadline(body.deadline);
      body.updated_at = new Date().toISOString();
      const row = await run(requireClient().from('tasks').update(body).eq('id', id).select().single());
      return { task: row };
    },
    // XP, level-up, dan badge dihitung di database (fungsi SQL set_task_status)
    async updateTaskStatus(id, status) {
      const result = await run(requireClient().rpc('set_task_status', { p_task_id: Number(id), p_status: status }));
      return { task: result.task, user: await loadUser(), leveledUp: !!result.leveledUp };
    },
    async deleteTask(id) {
      await run(requireClient().from('tasks').delete().eq('id', id));
      return { ok: true };
    },

    /* ---------------- Statistik ---------------- */
    async getStats() {
      const since = new Date(Date.now() - 6 * 864e5).toISOString();
      const rows = await run(requireClient().from('progress').select('xp_earned, created_at')
        .gte('created_at', since));
      const byDay = {};
      rows.forEach(r => {
        const d = r.created_at.slice(0, 10); // tanggal UTC
        byDay[d] = (byDay[d] || 0) + r.xp_earned;
      });
      return { xpLast7Days: Object.entries(byDay).map(([d, xp]) => ({ d, xp })) };
    },

    /* ---------------- Foto profil (Supabase Storage) ---------------- */
    async uploadAvatar(file) {
      const client = requireClient();
      if (!file) throw new Error('Pilih file foto terlebih dahulu.');
      const ext = AVATAR_TYPES[file.type];
      if (!ext) throw new Error('Format foto harus JPG, PNG, atau WebP.');
      if (file.size > AVATAR_MAX_BYTES) throw new Error('Ukuran foto maksimal 2 MB.');

      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Belum login.');
      const uid = session.user.id;

      const { avatar_url: oldUrl } = await run(client.from('profiles').select('avatar_url').eq('id', uid).single());

      // Nama file unik tiap upload -> otomatis lolos cache CDN
      const path = `${uid}/avatar-${Date.now()}.${ext}`;
      await run(client.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600' }));
      const { data: pub } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);

      await run(client.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', uid));

      // Bersihkan foto lama (best-effort)
      if (oldUrl) {
        const marker = `/${AVATAR_BUCKET}/`;
        const idx = oldUrl.indexOf(marker);
        if (idx !== -1) {
          client.storage.from(AVATAR_BUCKET).remove([decodeURIComponent(oldUrl.slice(idx + marker.length))]).catch(() => {});
        }
      }
      return { avatar_url: pub.publicUrl };
    },
  };

  window.Api = Api;
})();
