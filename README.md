# 🌙 Smart Study Planner — MoonKnight Edition (Netlify + Supabase)

Versi ini sudah dimigrasikan dari Express + SQLite ke arsitektur **tanpa server**:

| Bagian | Sebelumnya | Sekarang |
|---|---|---|
| Hosting | `node server.js` | **Netlify** (situs statis) |
| Database | SQLite (`planner.db`) | **Supabase Postgres** |
| Login | express-session + bcrypt | **Supabase Auth** |
| Foto | — | **Supabase Storage** (foto profil) |
| Penghubung | `fetch('/api/...')` | **supabase-js** di `frontend/js/api.js` |

Folder `backend/` sudah tidak diperlukan dan dihapus.

## 🚀 Langkah Setup (±10 menit)

### 1. Buat project Supabase
1. Daftar/login di <https://supabase.com> → **New project** (simpan password database-nya).
2. Buka **SQL Editor → New query**, salin seluruh isi `supabase/schema.sql`, klik **Run**.
   Ini membuat tabel, aturan keamanan (RLS), fungsi XP, dan bucket foto `avatars`.
3. Buka **Authentication → Providers → Email** dan **matikan "Confirm email"** agar pendaftaran
   (dan tombol *Masuk sebagai Demo*) langsung masuk tanpa verifikasi email.
   Jika ingin tetap memakai konfirmasi email, biarkan menyala — aplikasi akan menampilkan pesan "cek email".
4. Buka **Project Settings → API**, catat **Project URL** dan **anon / publishable key**.

### 2. Isi konfigurasi
Edit `frontend/js/config.js`:
```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```
> Key *anon/publishable* memang aman di frontend — datamu dilindungi RLS.
> **Jangan pernah** memakai key `service_role` di sini.

### 3. Deploy ke Netlify
**Cara A — Drag & drop (tercepat):** buka <https://app.netlify.com/drop> lalu seret **folder `frontend`**
(setelah `config.js` terisi).

**Cara B — Lewat Git (otomatis tiap push):**
1. Push folder proyek ini ke GitHub.
2. Netlify → **Add new site → Import from Git** → pilih repo. Pengaturan build otomatis terbaca dari `netlify.toml`
   (publish directory: `frontend`).
3. Opsional: daripada mengedit `config.js`, isi **Site configuration → Environment variables**:
   `SUPABASE_URL` dan `SUPABASE_ANON_KEY`. `build.js` akan membuat `config.js` saat build.

### 4. Setelah situs live
Di Supabase → **Authentication → URL Configuration**, isi **Site URL** dengan alamat Netlify-mu
(mis. `https://nama-situs.netlify.app`). Penting bila konfirmasi email dinyalakan.

### 5. (Opsional) Jadikan akunmu admin
Daftar dulu lewat aplikasi, lalu jalankan di SQL Editor:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'emailkamu@contoh.com');
```
Admin bisa membaca semua baris `profiles`. Belum ada halaman admin di UI.

## 🔒 Keamanan
- **RLS aktif** di semua tabel: setiap user hanya bisa membaca/mengubah datanya sendiri.
- **XP, level, dan badge tidak bisa dimanipulasi dari browser.** Klien tidak punya hak mengubah `profiles.xp`,
  `profiles.badges`, `profiles.role`, maupun `tasks.status`. Semuanya lewat fungsi SQL `set_task_status()`.
- Foto profil: maks. 2 MB, hanya JPG/PNG/WebP, dan user hanya bisa menulis ke folder `avatars/<id-user>/` miliknya.
- Header keamanan dasar dipasang lewat `netlify.toml`.

## 📁 Struktur
```
moonknight-planner/
├── netlify.toml              # publish = frontend, header keamanan
├── build.js                  # (opsional) tulis config.js dari env var Netlify
├── supabase/
│   └── schema.sql            # tabel, RLS, fungsi XP, trigger profil, bucket foto
└── frontend/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── config.js         # ← isi URL & anon key Supabase di sini
        ├── gamify.js         # level/rank/rekomendasi (tampilan)
        ├── api.js            # Supabase Auth, Postgres, Storage
        ├── app.js            # logika UI
        └── vendor/supabase.js  # supabase-js 2.45.4 (UMD, disertakan lokal)
```

## 🧪 Menjalankan lokal
Cukup sajikan folder `frontend` dengan server statis apa pun, mis. `npx serve frontend`,
lalu buka alamat yang ditampilkan (tidak perlu `npm install` / backend).

## 🛠️ Troubleshooting
| Gejala | Penyebab / solusi |
|---|---|
| "Supabase belum dikonfigurasi" di halaman login | `config.js` masih berisi placeholder. |
| "Database error saving new user" saat daftar | `schema.sql` belum dijalankan (trigger profil belum ada). |
| Daftar berhasil tapi tidak bisa masuk | "Confirm email" masih menyala — konfirmasi lewat email atau matikan di langkah 1.3. |
| Upload foto gagal | Pastikan bagian 5 `schema.sql` (Storage) ikut dijalankan; cek ukuran ≤ 2 MB. |
| Data tugas kosong setelah login | Normal untuk akun baru — data SQLite lama tidak ikut terbawa (hanya berisi 1 akun uji). |

Selamat berjuang melawan deadline. 🌙⚔️
