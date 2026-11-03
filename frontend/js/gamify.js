// Logika gamifikasi sisi klien (hanya untuk TAMPILAN).
// Perhitungan XP/badge yang sebenarnya dilakukan di database
// (fungsi SQL set_task_status) agar tidak bisa dimanipulasi dari browser.
const Gamify = (() => {
  function xpForLevel(level) {
    return level * 100; // XP dibutuhkan untuk naik ke level berikutnya
  }

  function calcLevel(xp) {
    let level = 1;
    let remaining = Math.max(0, xp || 0);
    while (remaining >= xpForLevel(level)) {
      remaining -= xpForLevel(level);
      level += 1;
    }
    return { level, xpIntoLevel: remaining, xpNeeded: xpForLevel(level) };
  }

  function rankFromLevel(level) {
    if (level >= 8) return 'Master';
    if (level >= 4) return 'Pro';
    return 'Beginner';
  }

  // Rekomendasi sederhana: skor prioritas dari deadline, label urgent, dan usia tugas
  function recommendTask(tasks) {
    const now = Date.now();
    const active = tasks.filter(t => t.status !== 'selesai');
    if (active.length === 0) return null;

    const scored = active.map(t => {
      let score = 0;
      if (t.deadline) {
        const hoursLeft = (new Date(t.deadline).getTime() - now) / 36e5;
        if (hoursLeft < 0) score += 100;        // sudah lewat deadline
        else if (hoursLeft <= 24) score += 80;
        else if (hoursLeft <= 72) score += 50;
        else score += 20;
      }
      if (t.priority === 'urgent') score += 40;
      const ageDays = (now - new Date(t.created_at).getTime()) / 864e5;
      if (ageDays >= 3) score += Math.min(ageDays * 3, 30); // tugas lama naik prioritas
      return { ...t, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  return { xpForLevel, calcLevel, rankFromLevel, recommendTask };
})();
