// Konfigurasi Supabase.
// Isi dari: Supabase Dashboard -> Project Settings -> API
//   - Project URL
//   - anon / publishable key  (BOLEH publik; keamanan dijaga oleh RLS di database)
// JANGAN PERNAH memasukkan "service_role" key ke file ini.
//
// Jika deploy lewat Git di Netlify, kamu bisa membiarkan file ini dan mengisi
// environment variable SUPABASE_URL & SUPABASE_ANON_KEY — build.js akan menimpanya otomatis.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://qpjugrzhzisglevwlrct.supabase.co/rest/v1/',
  SUPABASE_ANON_KEY: 'sb_publishable_vXB3ZoWX0DqLlPZbO0STXw_-om9CQre',
};
