// Dijalankan Netlify saat build (lihat netlify.toml).
// Jika environment variable SUPABASE_URL dan SUPABASE_ANON_KEY diset di Netlify,
// file frontend/js/config.js dibuat otomatis. Jika tidak, config.js dipakai apa adanya.
const fs = require('fs');
const path = require('path');

const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();
const target = path.join(__dirname, 'frontend', 'js', 'config.js');

if (url && key) {
  const config = { SUPABASE_URL: url, SUPABASE_ANON_KEY: key };
  fs.writeFileSync(target, `// Dibuat otomatis oleh build.js dari environment variable Netlify\nwindow.APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
  console.log('✔ js/config.js dibuat dari environment variable SUPABASE_URL & SUPABASE_ANON_KEY');
} else if (/YOUR-PROJECT-REF|YOUR-ANON-KEY/.test(fs.readFileSync(target, 'utf8'))) {
  console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY belum diset dan js/config.js masih berisi placeholder.');
  console.warn('  Situs akan ter-deploy, tetapi login belum berfungsi sampai kamu mengisinya.');
} else {
  console.log('✔ Memakai js/config.js yang sudah diisi manual');
}
