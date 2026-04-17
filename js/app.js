// ============================================================
// PDI TA App - All-in-One JavaScript
// Disesuaikan dengan Schema Firestore:
//   Collection: users, laporan, notifikasi
// ============================================================

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyBUcw8o7otTVB97wR0mMJIo2LNkS_oSB5Y",
  authDomain: "pdi-ta-app.firebaseapp.com",
  projectId: "pdi-ta-app",
  storageBucket: "pdi-ta-app.appspot.com",
  messagingSenderId: "477558489412",
  appId: "1:477558489412:web:b0898e239f2145a5299711"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Cloudinary Config ---
const CLOUD_NAME = "ddkurnia";
const UPLOAD_PRESET = "pdi-ta-upload";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// --- Global State ---
let currentUser = null;
let uploadedPhotos = [];
let notifUnsubscribe = null;

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type = 'info') {
  let c = document.getElementById('toastBox');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastBox';
    c.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  const colors = { success: '#28a745', error: '#dc3545', warning: '#e67e22', info: '#007bff' };
  const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };
  t.style.cssText = `padding:12px 18px;color:#fff;font-size:13px;font-weight:500;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);display:flex;align-items:center;gap:8px;animation:slideIn .3s;max-width:380px;background:${colors[type] || colors.info};pointer-events:auto;`;
  t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function showLoading() {
  let o = document.getElementById('loadOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'loadOverlay';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;z-index:9000;';
    o.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(o);
  }
  o.style.display = 'flex';
}
function hideLoading() {
  const o = document.getElementById('loadOverlay');
  if (o) o.style.display = 'none';
}

function formatDate(d) {
  if (!d) return '-';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '-';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d) {
  if (!d) return '';
  const dt = d.toDate ? d.toDate() : new Date(d);
  const s = Math.floor((Date.now() - dt) / 1000);
  if (s < 60) return 'Baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
  return formatDate(d);
}
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function getDateRange(p) {
  const n = new Date();
  let s, e;
  if (p === 'daily') {
    s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    e = new Date(s.getTime() + 86400000);
  } else if (p === 'weekly') {
    s = new Date(n); s.setDate(n.getDate() - 7);
    e = new Date(n);
  } else if (p === 'monthly') {
    s = new Date(n.getFullYear(), n.getMonth(), 1);
    e = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  } else if (p === 'yearly') {
    s = new Date(n.getFullYear(), 0, 1);
    e = new Date(n.getFullYear() + 1, 0, 1);
  } else {
    s = new Date(2020, 0, 1);
    e = new Date(n.getFullYear() + 1, 0, 1);
  }
  return {
    start: firebase.firestore.Timestamp.fromDate(s),
    end: firebase.firestore.Timestamp.fromDate(e)
  };
}

function openLightbox(src) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:8000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.onclick = () => lb.remove();
  lb.innerHTML = `<button style="position:absolute;top:16px;right:16px;color:#fff;font-size:32px;background:none;border:none;cursor:pointer;">&times;</button><img src="${src}" style="max-width:92vw;max-height:92vh;border-radius:8px;">`;
  document.body.appendChild(lb);
}

function logout() {
  if (confirm('Keluar dari aplikasi?')) {
    auth.signOut().then(() => location.href = 'index.html').catch(e => showToast(e.message, 'error'));
  }
}

function checkAuth(role) {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async user => {
      if (!user) { location.href = 'index.html'; return reject('no auth'); }
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (!doc.exists) {
          showToast('Data user tidak ditemukan di database', 'error');
          auth.signOut();
          location.href = 'index.html';
          return reject('no data');
        }
        const u = doc.data();
        if (u.status !== 'active') {
          showToast('Akun belum di-approve admin', 'warning');
          auth.signOut();
          location.href = 'index.html';
          return reject('not active');
        }
        if (role && u.role !== role) {
          showToast('Akses ditolak', 'error');
          location.href = u.role === 'admin' ? 'admin.html' : 'ta.html';
          return reject('wrong role');
        }
        currentUser = { uid: user.uid, ...u };
        resolve(currentUser);
      } catch (e) {
        console.error('checkAuth error:', e);
        reject(e);
      }
    });
  });
}

// ============================================================
// CLOUDINARY UPLOAD
// ============================================================
async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  try {
    const r = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
    if (r.ok) { const d = await r.json(); return d.secure_url; }
  } catch (e) {
    console.warn('Cloudinary upload gagal, pakai base64:', e);
  }
  // fallback: base64
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

function pickPhotos(inputId) { document.getElementById(inputId).click(); }

async function processFiles(input, gridId) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) { showToast(f.name + ' terlalu besar (maks 5MB)', 'warning'); continue; }
    if (!f.type.startsWith('image/')) { showToast(f.name + ' bukan gambar', 'warning'); continue; }
    showToast('Mengupload ' + f.name + '...', 'info');
    try {
      const url = await uploadToCloudinary(f);
      uploadedPhotos.push(url);
      const g = document.getElementById(gridId);
      const d = document.createElement('div');
      d.className = 'photo-thumb';
      d.innerHTML = `<img src="${url}"><button onclick="rmPhoto(this,'${url}')" class="rm-photo">&times;</button>`;
      g.appendChild(d);
      showToast('Foto berhasil diupload', 'success');
    } catch (e) { showToast('Gagal upload ' + f.name, 'error'); }
  }
  input.value = '';
}

function rmPhoto(btn, url) {
  uploadedPhotos = uploadedPhotos.filter(u => u !== url);
  btn.parentElement.remove();
}

// ============================================================
// NOTIFICATIONS (collection: notifikasi)
// Schema: judul, pesan, target, userId, isRead, createdAt
// ============================================================
function initNotifs(myUid) {
  // Hitung unread: target == myUid atau target == 'all', dan isRead == false
  notifUnsubscribe = db.collection('notifikasi')
    .where('target', 'in', [myUid, 'all'])
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      let count = 0;
      snap.forEach(d => {
        const n = d.data();
        // Untuk broadcast (target='all'), cek apakah ini milik user ini via userId field
        if (!n.isRead) count++;
      });
      updateBadge(count);
    }, err => {
      console.warn('Notif listener error:', err);
    });
}

function updateBadge(c) {
  document.querySelectorAll('.notif-badge').forEach(b => {
    b.textContent = c > 99 ? '99+' : c;
    b.style.display = c > 0 ? 'flex' : 'none';
  });
}

async function markRead(notifId) {
  try {
    await db.collection('notifikasi').doc(notifId).update({ isRead: true });
  } catch (e) { console.error('markRead:', e); }
}

async function markAllRead(myUid) {
  try {
    const snap = await db.collection('notifikasi')
      .where('target', 'in', [myUid, 'all'])
      .where('isRead', '==', false)
      .get();
    const batch = db.batch();
    snap.forEach(d => batch.update(d.ref, { isRead: true }));
    await batch.commit();
    updateBadge(0);
    showToast('Semua notifikasi dibaca', 'success');
    // reload
    loadNotifPage();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function renderNotifs(snap, myUid) {
  const el = document.getElementById('notifList');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#128276;</div><h4>Belum Ada Notifikasi</h4><p>Notifikasi terbaru akan muncul di sini</p></div>';
    return;
  }
  const ic = { report: ['&#128203;', '#c4161c'], approval: ['&#9989;', '#28a745'], info: ['&#8505;', '#007bff'], warning: ['&#9888;', '#e67e22'], broadcast: ['&#128226;', '#6f42c1'] };
  let h = '';
  snap.forEach(d => {
    const n = d.data();
    const ur = !n.isRead;
    // Determine icon based on content
    let iconType = 'info';
    const judul = (n.judul || '').toLowerCase();
    if (judul.includes('disetujui') || judul.includes('akun')) iconType = 'approval';
    else if (judul.includes('laporan baru') || judul.includes('ditolak')) iconType = 'warning';
    else if (judul.includes('pengumuman') || judul.includes('pemberitahuan')) iconType = 'broadcast';
    const s = ic[iconType] || ic.info;

    h += `<div class="notif-item ${ur ? 'unread' : ''}" onclick="markRead('${d.id}')">
      <div class="notif-ic" style="background:${s[1]}18;color:${s[1]}">${s[0]}</div>
      <div class="notif-body">
        <b>${esc(n.judul || '')}</b>
        <p>${esc(n.pesan || '')}</p>
        <span>${timeAgo(n.createdAt)}</span>
      </div>
    </div>`;
  });
  el.innerHTML = h;
}

// ============================================================
// AUTH (Login / Register)
// Collection: users
// Schema: email, nama, role, status, createdAt
// ============================================================
async function doLogin() {
  const email = $v('loginEmail'), pw = $v('loginPassword');
  if (!email || !pw) return showToast('Isi email dan password', 'error');
  showLoading();
  try {
    const res = await auth.signInWithEmailAndPassword(email, pw);
    const doc = await db.collection('users').doc(res.user.uid).get();
    if (!doc.exists) {
      hideLoading();
      showToast('Data user tidak ditemukan. Silakan daftar ulang.', 'error');
      auth.signOut();
      return;
    }
    const u = doc.data();
    if (u.status === 'pending') {
      hideLoading();
      showToast('Akun belum di-approve admin. Silakan hubungi admin.', 'warning');
      auth.signOut();
      return;
    }
    if (u.status === 'rejected') {
      hideLoading();
      showToast('Akun ditolak oleh admin.', 'error');
      auth.signOut();
      return;
    }
    hideLoading();
    showToast('Login berhasil!', 'success');
    location.href = u.role === 'admin' ? 'admin.html' : 'ta.html';
  } catch (e) {
    hideLoading();
    const m = {
      'auth/user-not-found': 'Email tidak terdaftar',
      'auth/wrong-password': 'Password salah',
      'auth/invalid-email': 'Format email tidak valid',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
      'auth/network-request-failed': 'Koneksi internet bermasalah'
    };
    showToast(m[e.code] || ('Gagal login: ' + (e.message || '')), 'error');
  }
}

async function doRegister() {
  const nama = $v('regNama'), email = $v('regEmail'), pw = $v('regPw'), cpw = $v('regPwC');
  if (!nama || !email || !pw || !cpw) return showToast('Semua field wajib diisi', 'error');
  if (pw.length < 6) return showToast('Password minimal 6 karakter', 'error');
  if (pw !== cpw) return showToast('Konfirmasi password tidak cocok', 'error');
  showLoading();
  try {
    // Step 1: Buat akun auth
    const r = await auth.createUserWithEmailAndPassword(email, pw);
    // Step 2: Simpan ke collection "users" sesuai schema
    await db.collection('users').doc(r.user.uid).set({
      email: email,
      nama: nama,
      role: 'ta',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Step 3: Logout otomatis
    await auth.signOut();
    hideLoading();
    showToast('Pendaftaran berhasil! Silakan tunggu admin approve akun Anda.', 'success');
    switchAuthTab('login');
  } catch (e) {
    hideLoading();
    console.error('Register error:', e.code, e.message);
    // Jika Firestore gagal, hapus akun auth yang sudah terbuat
    if (auth.currentUser && e.code && !e.code.startsWith('auth/')) {
      try { await auth.currentUser.delete(); } catch (delErr) { console.warn('Cleanup:', delErr); }
    }
    const m = {
      'auth/email-already-in-use': 'Email sudah terdaftar. Gunakan email lain.',
      'auth/invalid-email': 'Format email tidak valid',
      'auth/weak-password': 'Password terlalu lemah (min 6 karakter)',
      'auth/operation-not-allowed': 'Email/Password auth belum diaktifkan di Firebase Console',
      'auth/network-request-failed': 'Koneksi internet bermasalah',
      'permission-denied': 'Akses Firestore ditolak! Cek Security Rules di Firebase Console.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.'
    };
    const msg = m[e.code] || ('Gagal daftar: ' + (e.message || 'Unknown error'));
    showToast(msg, 'error');
  }
}

async function doResetPw() {
  const email = $v('loginEmail');
  if (!email) return showToast('Masukkan email dulu', 'error');
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Link reset password dikirim ke email Anda', 'success');
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function switchAuthTab(t) {
  document.getElementById('formLogin').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('formRegister').style.display = t === 'register' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
}

function $v(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function $s(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function $sv(id, val) { const e = document.getElementById(id); if (e) e.value = val; }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function printPage() { window.print(); }

// ============================================================
// TAB NAVIGATION
// ============================================================
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(e => e.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab_' + name);
  if (el) el.style.display = 'block';
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');

  // Load data sesuai tab
  if (name === 'dashboard' && currentUser && currentUser.role === 'ta') loadTADashboard();
  if (name === 'profil') loadProfil();
  if (name === 'buat') loadBuatForm();
  if (name === 'laporan') loadLaporan();
  if (name === 'notif') loadNotifPage();
  if (name === 'a_dashboard') loadAdminDash();
  if (name === 'a_reports') loadAdminReports();
  if (name === 'a_users') loadAdminUsers();
  if (name === 'a_notif') loadNotifPage();
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sb-overlay').classList.toggle('show');
}

// ============================================================
// TA MODULE
// ============================================================

// --- Dashboard ---
async function loadTADashboard() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  try {
    // Semua query ke collection "laporan" dengan field "userId"
    const [total, pending, approved, rejected] = await Promise.all([
      db.collection('laporan').where('userId', '==', uid).get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'pending').get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'approved').get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'rejected').get()
    ]);
    const { start, end } = getDateRange('monthly');
    const mSnap = await db.collection('laporan').where('userId', '==', uid).where('createdAt', '>=', start).where('createdAt', '<', end).get();

    $s('s_total', total.size);
    $s('s_pending', pending.size);
    $s('s_approved', approved.size);
    $s('s_rejected', rejected.size);
    $s('s_monthly', mSnap.size);

    // Alert profil
    const pAlert = document.getElementById('profileAlert');
    if (pAlert) pAlert.style.display = (!currentUser.jabatan) ? 'flex' : 'none';

    // Recent reports
    const snap = await db.collection('laporan').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(10).get();
    const tbody = document.getElementById('recentReports');
    if (!tbody) return;
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="empty-icon">&#128203;</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div></td></tr>';
      return;
    }
    let h = '';
    snap.forEach(d => { h += reportRow(d.data(), d.id, false); });
    tbody.innerHTML = h;
  } catch (e) { console.error('loadTADashboard error:', e); }
}

function reportRow(r, id, showTA) {
  const sc = r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'wait';
  const st = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
  const fotoCount = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl.length : 1) : 0;
  return `<tr>
    <td><b>${formatDate(r.tanggal)}</b></td>
    ${showTA ? `<td>${esc(r.nama || '-')}</td>` : ''}
    <td>${esc(r.judul)}</td>
    <td>${esc(r.type || 'Harian')}</td>
    <td>${fotoCount} foto</td>
    <td><span class="badge badge-${sc}">${st}</span></td>
    <td><button class="btn btn-sm btn-outline" onclick="viewReport('${id}')">Detail</button></td>
  </tr>`;
}

// --- Profil ---
async function loadProfil() {
  if (!currentUser) return;
  $sv('pNama', currentUser.nama || '');
  $sv('pJabatan', currentUser.jabatan || '');
  $sv('pNip', currentUser.nip || '');
  $sv('pWilayah', currentUser.wilayah || '');
  $sv('pNohp', currentUser.nohp || '');
  $sv('pAlamat', currentUser.alamat || '');
  // Foto
  const g = document.getElementById('pPhotoGrid');
  if (g && currentUser.photo) {
    g.innerHTML = `<div class="photo-thumb"><img src="${currentUser.photo}"></div>`;
  }
  uploadedPhotos = [];
}

async function saveProfil() {
  const nama = $v('pNama'), nip = $v('pNip'), jabatan = $v('pJabatan');
  const wilayah = $v('pWilayah'), nohp = $v('pNohp'), alamat = $v('pAlamat');
  if (!nama || !jabatan) return showToast('Nama dan Jabatan wajib diisi', 'error');
  showLoading();
  try {
    const photo = uploadedPhotos[0] || currentUser.photo || '';
    // Update collection "users"
    await db.collection('users').doc(currentUser.uid).update({
      nama, nip, jabatan, wilayah, nohp, alamat, photo
    });
    // Update local state
    currentUser.nama = nama;
    currentUser.jabatan = jabatan;
    document.getElementById('userName').textContent = nama;
    hideLoading();
    showToast('Profil berhasil disimpan!', 'success');
    showTab('dashboard');
  } catch (e) {
    hideLoading();
    showToast('Gagal menyimpan: ' + e.message, 'error');
  }
}

// --- Buat Laporan ---
async function loadBuatForm() {
  if (!currentUser) return;
  uploadedPhotos = [];
  const g = document.getElementById('rPhotoGrid');
  if (g) g.innerHTML = '';
  const taName = currentUser.nama || currentUser.email || '';
  $sv('rNama', taName);
  $sv('rTanggal', new Date().toISOString().split('T')[0]);
}

async function submitReport() {
  const nama = $v('rNama'), judul = $v('rJudul'), isi = $v('rIsi');
  const type = $v('rType'), tanggal = $v('rTanggal');
  if (!nama || !judul || !isi || !tanggal) return showToast('Semua field wajib diisi', 'error');
  showLoading();
  try {
    // Simpan ke collection "laporan" sesuai schema
    const fotoUrl = uploadedPhotos.length > 0 ? uploadedPhotos : [];
    await db.collection('laporan').add({
      userId: currentUser.uid,
      nama: nama,
      judul: judul,
      isi: isi,
      type: type || 'Harian',
      tanggal: firebase.firestore.Timestamp.fromDate(new Date(tanggal)),
      fotoUrl: fotoUrl,
      status: 'pending',
      catatanAdmin: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Kirim notifikasi ke admin
    await db.collection('notifikasi').add({
      judul: 'Laporan Baru',
      pesan: nama + ' mengirim laporan: "' + judul + '"',
      target: 'admin',
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Laporan berhasil dikirim!', 'success');
    showTab('laporan');
  } catch (e) {
    hideLoading();
    showToast('Gagal mengirim: ' + e.message, 'error');
  }
}

// --- Lihat Laporan ---
async function loadLaporan() {
  if (!currentUser) return;
  const period = document.getElementById('fPeriod') ? document.getElementById('fPeriod').value : 'all';
  const tbody = document.getElementById('laporanTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7"><div class="spinner-center"><div class="spinner"></div></div></td></tr>';

  try {
    let q = db.collection('laporan');
    // TA hanya lihat laporannya sendiri
    if (currentUser.role !== 'admin') q = q.where('userId', '==', currentUser.uid);
    if (period !== 'all') {
      const { start, end } = getDateRange(period);
      q = q.where('createdAt', '>=', start).where('createdAt', '<', end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    const snap = await q.get();

    // Stats
    let ap = 0, pe = 0, re = 0;
    snap.forEach(d => {
      const s = d.data().status;
      if (s === 'approved') ap++;
      else if (s === 'pending') pe++;
      else if (s === 'rejected') re++;
    });
    $s('f_total', snap.size);
    $s('f_approved', ap);
    $s('f_pending', pe);
    $s('f_rejected', re);

    if (!snap.size) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty-icon">&#128203;</div><h4>Tidak ada laporan</h4><p>Belum ada laporan untuk periode ini</p></div></td></tr>';
      return;
    }

    const isAdmin = currentUser.role === 'admin';
    let h = '';
    let no = 1;
    snap.forEach(d => {
      const r = d.data();
      const sc = r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'wait';
      const st = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      const fotoCount = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl.length : 1) : 0;
      h += `<tr>
        <td>${no++}</td>
        <td><b>${formatDate(r.tanggal)}</b></td>
        ${isAdmin ? `<td>${esc(r.nama || '-')}</td>` : ''}
        <td>${esc(r.judul)}</td>
        <td>${esc(r.type || 'Harian')}</td>
        <td>${fotoCount} foto</td>
        <td><span class="badge badge-${sc}">${st}</span></td>
        <td><button class="btn btn-sm btn-outline" onclick="viewReport('${d.id}')">Detail</button></td>
      </tr>`;
    });
    tbody.innerHTML = h;
  } catch (e) {
    console.error('loadLaporan error:', e);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">Gagal memuat. Coba ubah filter atau cek koneksi.</td></tr>';
  }
}

// --- View Report Detail ---
async function viewReport(id) {
  const modal = document.getElementById('reportModal');
  const body = document.getElementById('reportModalBody');
  if (!modal || !body) return;
  body.innerHTML = '<div class="spinner-center" style="padding:40px"><div class="spinner"></div></div>';
  modal.classList.add('show');

  try {
    const doc = await db.collection('laporan').doc(id).get();
    if (!doc.exists) { body.innerHTML = '<p style="text-align:center;color:#999">Laporan tidak ditemukan</p>'; return; }
    const r = doc.data();
    const sc = r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'wait';
    const st = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';

    // Foto
    let photos = '';
    const fotoList = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl : [r.fotoUrl]) : [];
    if (fotoList.length > 0) {
      photos = `<h4 style="margin:16px 0 8px">Foto Kegiatan (${fotoList.length})</h4>
        <div class="photo-grid">${fotoList.map(f => `<div class="photo-thumb"><img src="${f}" onclick="openLightbox('${f}')" loading="lazy"></div>`).join('')}</div>`;
    }

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span class="badge badge-${sc}" style="font-size:13px;padding:4px 14px">${st}</span>
        <span style="font-size:12px;color:#999">${formatDateTime(r.createdAt)}</span>
      </div>
      <div class="detail-row"><label>Tenaga Ahli</label><p><b>${esc(r.nama || '-')}</b></p></div>
      <div class="detail-row"><label>Tanggal</label><p><b>${formatDate(r.tanggal)}</b></p></div>
      <div class="detail-row"><label>Tipe</label><p>${esc(r.type || 'Harian')}</p></div>
      <div class="detail-row"><label>Judul</label><p><b>${esc(r.judul)}</b></p></div>
      <div class="detail-row"><label>Isi Laporan</label><div class="detail-isi">${esc(r.isi)}</div></div>
      ${r.catatanAdmin ? `<div class="detail-row"><label>Catatan Admin</label><div class="detail-note">${esc(r.catatanAdmin)}</div></div>` : ''}
      ${photos}
      ${currentUser.role === 'admin' && r.status === 'pending' ? `
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee">
          <h4 style="margin-bottom:8px">Aksi Admin</h4>
          <div class="form-group"><label>Catatan (opsional)</label><textarea id="adminNote" class="form-control" rows="3" placeholder="Catatan admin..."></textarea></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-success" onclick="approveReport('${id}')">&#9989; Setujui</button>
            <button class="btn btn-danger" onclick="rejectReport('${id}')">&#10060; Tolak</button>
          </div>
        </div>` : ''}
    `;
  } catch (e) {
    console.error('viewReport error:', e);
    body.innerHTML = '<p style="text-align:center;color:#999">Gagal memuat detail</p>';
  }
}

// --- Notifications Page ---
async function loadNotifPage() {
  if (!currentUser) return;
  try {
    const snap = await db.collection('notifikasi')
      .where('target', 'in', [currentUser.uid, 'all'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    renderNotifs(snap, currentUser.uid);
  } catch (e) {
    console.error('loadNotifPage:', e);
    const el = document.getElementById('notifList');
    if (el) el.innerHTML = '<div class="empty"><h4>Gagal memuat notifikasi</h4></div>';
  }
}

// ============================================================
// ADMIN MODULE
// ============================================================

async function loadAdminDash() {
  if (!currentUser) return;
  try {
    const [taSnap, pendSnap, totalSnap, pRepSnap, aRepSnap] = await Promise.all([
      db.collection('users').where('role', '==', 'ta').where('status', '==', 'active').get(),
      db.collection('users').where('status', '==', 'pending').get(),
      db.collection('laporan').get(),
      db.collection('laporan').where('status', '==', 'pending').get(),
      db.collection('laporan').where('status', '==', 'approved').get()
    ]);
    const { start: ms, end: me } = getDateRange('monthly');
    const mRep = await db.collection('laporan').where('createdAt', '>=', ms).where('createdAt', '<', me).get();
    const { start: ys, end: ye } = getDateRange('yearly');
    const yRep = await db.collection('laporan').where('createdAt', '>=', ys).where('createdAt', '<', ye).get();

    $s('a_totalTA', taSnap.size);
    $s('a_pendUser', pendSnap.size);
    $s('a_totalRep', totalSnap.size);
    $s('a_pendRep', pRepSnap.size);
    $s('a_okRep', aRepSnap.size);
    $s('a_monthRep', mRep.size);
    $s('a_yearRep', yRep.size);

    // Pending users
    const el = document.getElementById('pendUsers');
    if (!pendSnap.size) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">&#9989;</div><h4>Tidak ada permintaan baru</h4><p>Semua user sudah diproses</p></div>';
    } else {
      let h = '';
      pendSnap.forEach(d => {
        const u = d.data();
        h += `<div class="pend-item">
          <div><b>${esc(u.nama || u.email)}</b><br><small style="color:#999">${esc(u.email)} &middot; ${timeAgo(u.createdAt)}</small></div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-success" onclick="approveUser('${d.id}')">Setujui</button>
            <button class="btn btn-sm btn-danger" onclick="rejectUser('${d.id}')">Tolak</button>
          </div>
        </div>`;
      });
      el.innerHTML = h;
    }
  } catch (e) { console.error('loadAdminDash error:', e); }
}

async function approveUser(uid) {
  if (!confirm('Setujui user ini?')) return;
  showLoading();
  try {
    await db.collection('users').doc(uid).update({ status: 'active' });
    const uDoc = await db.collection('users').doc(uid).get();
    const name = uDoc.exists ? (uDoc.data().nama || uDoc.data().email) : 'User';

    // Kirim notifikasi ke user
    await db.collection('notifikasi').add({
      judul: 'Akun Disetujui',
      pesan: 'Selamat ' + name + '! Akun Anda telah disetujui admin. Anda sekarang dapat login.',
      target: uid,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('User disetujui', 'success');
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function rejectUser(uid) {
  const reason = prompt('Alasan penolakan (opsional):');
  if (reason === null) return;
  showLoading();
  try {
    await db.collection('users').doc(uid).update({ status: 'rejected' });
    const uDoc = await db.collection('users').doc(uid).get();
    const name = uDoc.exists ? (uDoc.data().nama || uDoc.data().email) : 'User';

    await db.collection('notifikasi').add({
      judul: 'Akun Ditolak',
      pesan: 'Maaf ' + name + ', akun Anda ditolak admin.' + (reason ? ' Alasan: ' + reason : ''),
      target: uid,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('User ditolak', 'success');
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function loadAdminReports() {
  const period = document.getElementById('aPeriod') ? document.getElementById('aPeriod').value : 'all';
  const tbody = document.getElementById('aRepTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7"><div class="spinner-center"><div class="spinner"></div></div></td></tr>';

  try {
    let q = db.collection('laporan');
    if (period !== 'all') {
      const { start, end } = getDateRange(period);
      q = q.where('createdAt', '>=', start).where('createdAt', '<', end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    const snap = await q.get();

    if (!snap.size) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty-icon">&#128203;</div><h4>Tidak ada laporan</h4></div></td></tr>';
      return;
    }

    let h = '';
    snap.forEach(d => {
      const r = d.data();
      const sc = r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : 'wait';
      const st = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      const fotoCount = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl.length : 1) : 0;
      h += `<tr>
        <td><b>${formatDate(r.tanggal)}</b></td>
        <td>${esc(r.nama || '-')}</td>
        <td>${esc(r.judul)}</td>
        <td>${esc(r.type || 'Harian')}</td>
        <td>${fotoCount}</td>
        <td><span class="badge badge-${sc}">${st}</span></td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline" onclick="viewReport('${d.id}')">Detail</button>
            ${r.status === 'pending' ? `
              <button class="btn btn-sm btn-success" onclick="quickApprove('${d.id}')">&#9989;</button>
              <button class="btn btn-sm btn-danger" onclick="quickReject('${d.id}')">&#10060;</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    });
    tbody.innerHTML = h;
  } catch (e) {
    console.error('loadAdminReports error:', e);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px">Gagal memuat</td></tr>';
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('aTaTable');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6"><div class="spinner-center"><div class="spinner"></div></div></td></tr>';

  try {
    const snap = await db.collection('users').where('role', '==', 'ta').orderBy('createdAt', 'desc').get();
    if (!snap.size) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty-icon">&#128101;</div><h4>Belum ada Tenaga Ahli</h4></div></td></tr>';
      return;
    }

    let h = '';
    snap.forEach(d => {
      const u = d.data();
      const sc = u.status === 'active' ? 'ok' : u.status === 'rejected' ? 'no' : 'wait';
      const st = u.status === 'active' ? 'Aktif' : u.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      h += `<tr>
        <td><b>${esc(u.nama || '-')}</b></td>
        <td>${esc(u.email)}</td>
        <td>${u.createdAt ? formatDate(u.createdAt) : '-'}</td>
        <td><span class="badge badge-${sc}">${st}</span></td>
        <td>${u.jabatan ? '<span style="color:#28a745">' + esc(u.jabatan) + '</span>' : '<span style="color:#e67e22">Belum</span>'}</td>
        <td>${u.status === 'pending' ? `
          <div class="flex gap-2">
            <button class="btn btn-sm btn-success" onclick="approveUser('${d.id}')">Setujui</button>
            <button class="btn btn-sm btn-danger" onclick="rejectUser('${d.id}')">Tolak</button>
          </div>` : '-'}
        </td>
      </tr>`;
    });
    tbody.innerHTML = h;
  } catch (e) {
    console.error('loadAdminUsers error:', e);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px">Gagal memuat</td></tr>';
  }
}

// --- Approve / Reject Reports ---
async function approveReport(id) {
  if (!confirm('Setujui laporan ini?')) return;
  showLoading();
  try {
    const note = document.getElementById('adminNote') ? $v('adminNote') : '';
    const upd = { status: 'approved' };
    if (note) upd.catatanAdmin = note;
    await db.collection('laporan').doc(id).update(upd);

    const doc = await db.collection('laporan').doc(id).get();
    const r = doc.data();

    await db.collection('notifikasi').add({
      judul: 'Laporan Disetujui',
      pesan: 'Laporan "' + r.judul + '" telah disetujui admin.' + (note ? ' Catatan: ' + note : ''),
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Laporan disetujui', 'success');
    closeModal('reportModal');
    loadAdminReports();
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickApprove(id) {
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'approved' });
    const doc = await db.collection('laporan').doc(id).get();
    const r = doc.data();

    await db.collection('notifikasi').add({
      judul: 'Laporan Disetujui',
      pesan: 'Laporan "' + r.judul + '" telah disetujui admin.',
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Disetujui', 'success');
    loadAdminReports();
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function rejectReport(id) {
  const note = document.getElementById('adminNote') ? $v('adminNote') : '';
  const reason = note || prompt('Alasan penolakan:');
  if (!reason) return showToast('Masukkan alasan penolakan', 'error');
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'rejected', catatanAdmin: reason });
    const doc = await db.collection('laporan').doc(id).get();
    const r = doc.data();

    await db.collection('notifikasi').add({
      judul: 'Laporan Ditolak',
      pesan: 'Laporan "' + r.judul + '" ditolak admin. Alasan: ' + reason,
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Laporan ditolak', 'success');
    closeModal('reportModal');
    loadAdminReports();
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickReject(id) {
  const reason = prompt('Alasan penolakan:');
  if (!reason) return;
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'rejected', catatanAdmin: reason });
    const doc = await db.collection('laporan').doc(id).get();
    const r = doc.data();

    await db.collection('notifikasi').add({
      judul: 'Laporan Ditolak',
      pesan: 'Laporan "' + r.judul + '" ditolak admin. Alasan: ' + reason,
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Ditolak', 'success');
    loadAdminReports();
    loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

// --- Broadcast ---
function openBroadcast() { document.getElementById('bcModal').classList.add('show'); }

async function sendBroadcast() {
  const judul = $v('bcTitle'), pesan = $v('bcMsg');
  if (!judul || !pesan) return showToast('Judul dan pesan wajib diisi', 'error');
  showLoading();
  try {
    // Kirim notifikasi dengan target 'all'
    await db.collection('notifikasi').add({
      judul: judul,
      pesan: pesan,
      target: 'all',
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    hideLoading();
    showToast('Pemberitahuan berhasil dikirim ke semua user!', 'success');
    $sv('bcTitle', '');
    $sv('bcMsg', '');
    closeModal('bcModal');
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}
