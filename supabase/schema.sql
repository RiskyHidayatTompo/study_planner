-- =====================================================================
-- Smart Study Planner — MoonKnight Edition
-- Skema Supabase (PostgreSQL). Jalankan SEKALI di:
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------

-- Profil + data gamifikasi. Baris dibuat otomatis oleh trigger saat user daftar.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  xp          integer not null default 0 check (xp >= 0),
  badges      jsonb not null default '[]'::jsonb,
  avatar_url  text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.schedules (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_name  text not null,
  day_of_week  smallint not null check (day_of_week between 0 and 6),  -- 0=Senin ... 6=Minggu
  start_time   text not null check (start_time ~ '^\d{2}:\d{2}$'),     -- HH:MM
  end_time     text not null check (end_time   ~ '^\d{2}:\d{2}$'),     -- HH:MM
  room         text,
  color        text not null default '#4f9eff',
  created_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  category    text not null default 'lainnya',                      -- coding, laporan, presentasi, dll
  priority    text not null default 'normal' check (priority in ('urgent', 'normal')),
  status      text not null default 'belum'  check (status in ('belum', 'proses', 'selesai')),
  deadline    timestamptz,
  xp_reward   integer not null default 20 check (xp_reward between 0 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.progress (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    bigint references public.tasks(id) on delete set null,
  xp_earned  integer not null,
  event      text not null,                                          -- 'task_completed', dll
  created_at timestamptz not null default now()
);

create index if not exists schedules_user_idx on public.schedules(user_id);
create index if not exists tasks_user_idx     on public.tasks(user_id);
create index if not exists progress_user_idx  on public.progress(user_id, created_at);

-- ---------------------------------------------------------------------
-- 2. FUNGSI BANTU
-- ---------------------------------------------------------------------

-- Level bertingkat: level 1 butuh 100 XP, level 2 butuh 200 XP tambahan, dst.
create or replace function public.calc_level(p_xp integer)
returns integer
language plpgsql
immutable
as $$
declare
  lvl integer := 1;
  remaining integer := greatest(p_xp, 0);
begin
  while remaining >= lvl * 100 loop
    remaining := remaining - lvl * 100;
    lvl := lvl + 1;
  end loop;
  return lvl;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Buat profil otomatis ketika user baru mendaftar lewat Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ubah status tugas + hitung XP, level-up, dan badge DI SISI DATABASE.
-- Dengan begitu XP tidak bisa dimanipulasi dari browser.
create or replace function public.set_task_status(p_task_id bigint, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t public.tasks%rowtype;
  prof public.profiles%rowtype;
  was_completed boolean;
  before_level integer;
  after_level integer;
  new_xp integer;
  completed_count integer;
  overdue_count integer;
  new_badges jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Belum login. Silakan login terlebih dahulu.' using errcode = '28000';
  end if;
  if p_status not in ('belum', 'proses', 'selesai') then
    raise exception 'Status tidak valid.';
  end if;

  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then
    raise exception 'Tugas tidak ditemukan.';
  end if;

  select * into prof from public.profiles where id = uid for update;
  if not found then
    raise exception 'Profil tidak ditemukan.';
  end if;

  was_completed := (t.status = 'selesai');
  before_level  := public.calc_level(prof.xp);
  new_xp        := prof.xp;

  update public.tasks set status = p_status, updated_at = now() where id = t.id;

  if p_status = 'selesai' and not was_completed then
    new_xp := prof.xp + t.xp_reward;
    insert into public.progress (user_id, task_id, xp_earned, event)
    values (uid, t.id, t.xp_reward, 'task_completed');
  elsif p_status <> 'selesai' and was_completed then
    -- batalkan penyelesaian -> tarik kembali XP
    new_xp := greatest(0, prof.xp - t.xp_reward);
  end if;

  after_level := public.calc_level(new_xp);

  -- Badge dihitung ulang dari riwayat tugas
  select count(*) into completed_count
    from public.tasks where user_id = uid and status = 'selesai';
  select count(*) into overdue_count
    from public.tasks
    where user_id = uid and status <> 'selesai' and deadline is not null and deadline < now();

  if completed_count >= 1 then
    new_badges := new_badges || jsonb_build_array(jsonb_build_object(
      'id', 'first_blood', 'name', 'Langkah Pertama', 'desc', 'Menyelesaikan tugas pertama'));
  end if;
  if completed_count >= 10 then
    new_badges := new_badges || jsonb_build_array(jsonb_build_object(
      'id', 'grinder', 'name', 'Sang Penggiat', 'desc', '10 tugas selesai'));
  end if;
  if completed_count >= 50 then
    new_badges := new_badges || jsonb_build_array(jsonb_build_object(
      'id', 'task_master', 'name', 'Task Master', 'desc', '50 tugas selesai'));
  end if;
  if completed_count >= 5 and overdue_count = 0 then
    new_badges := new_badges || jsonb_build_array(jsonb_build_object(
      'id', 'no_deadline_missed', 'name', 'No Deadline Missed', 'desc', 'Tidak pernah telat deadline'));
  end if;
  if after_level >= 8 then
    new_badges := new_badges || jsonb_build_array(jsonb_build_object(
      'id', 'master_rank', 'name', 'Moon Master', 'desc', 'Mencapai rank Master'));
  end if;

  update public.profiles set xp = new_xp, badges = new_badges where id = uid;

  select * into t from public.tasks where id = p_task_id;

  return jsonb_build_object(
    'task', to_jsonb(t),
    'xp', new_xp,
    'badges', new_badges,
    'leveledUp', after_level > before_level
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. HAK AKSES (GRANT) — prinsip "boleh minimal"
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.schedules, public.tasks, public.progress from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;   -- xp, badges, role: TIDAK bisa diubah klien

grant select, insert, update, delete on public.schedules to authenticated;

grant select, delete on public.tasks to authenticated;
grant insert (title, category, priority, deadline, xp_reward) on public.tasks to authenticated;
grant update (title, category, priority, deadline, xp_reward) on public.tasks to authenticated;  -- status hanya lewat set_task_status()

grant select on public.progress to authenticated;                          -- diisi oleh set_task_status()

revoke execute on function public.set_task_status(bigint, text) from public, anon;
grant  execute on function public.set_task_status(bigint, text) to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — setiap user hanya melihat datanya sendiri
-- ---------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.schedules enable row level security;
alter table public.tasks     enable row level security;
alter table public.progress  enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "schedules_own" on public.schedules;
create policy "schedules_own" on public.schedules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own" on public.progress
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. STORAGE — bucket foto profil (publik untuk dibaca, upload hanya ke folder sendiri)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 6. (OPSIONAL) Jadikan akunmu admin — ganti emailnya lalu jalankan:
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'emailkamu@contoh.com');
-- ---------------------------------------------------------------------
