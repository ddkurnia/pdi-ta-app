// ============================================================
// PDI TA App - All-in-One JavaScript (Modern Minimalist)
// ============================================================

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyBucw8o7otTVB97wR0mMJIo2LNkS_oSB5Y",
  authDomain: "pdi-ta-app.firebaseapp.com",
  projectId: "pdi-ta-app",
  storageBucket: "pdi-ta-app.firebasestorage.app",
  messagingSenderId: "477558489412",
  appId: "1:477558489412:web:b0898e239f2145a5299711"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Cloudinary Config ---
const CLOUD_NAME = "ddnv9ffai";
const UPLOAD_PRESET = "pdi-ta-upload";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// --- Global State ---
let currentUser = null;
let uploadedPhotos = [];
let notifUnsubscribe = null;

// ============================================================
// UTILITIES
// ============================================================
function $v(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function $s(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function $sv(id, val) { const e = document.getElementById(id); if (e) e.value = val; }

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function formatDate(d) {
  if (!d) return '-';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  let c = document.getElementById('toastArea');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastArea';
    c.className = 'toast-area';
    document.body.appendChild(c);
  }
  const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = 'toast-msg toast-' + type;
  t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ============================================================
// LOADING
// ============================================================
function showLoading() {
  let o = document.getElementById('loadingOverlay');
  if (!o) {
    o = document.createElement('div');
    o.id = 'loadingOverlay';
    o.className = 'loading-overlay';
    o.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(o);
  }
  o.classList.add('show');
}

function hideLoading() {
  const o = document.getElementById('loadingOverlay');
  if (o) o.classList.remove('show');
}

// ============================================================
// MODAL
// ============================================================
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function openLightbox(src) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:8000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.onclick = () => lb.remove();
  lb.innerHTML = `<img src="${src}" style="max-width:92vw;max-height:92vh;border-radius:12px;object-fit:contain;">`;
  document.body.appendChild(lb);
}

// ============================================================
// PAGE NAVIGATION (TA & Admin)
// ============================================================
function switchPage(name) {
  // Hide all pages
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  // Show selected
  const el = document.getElementById('page_' + name);
  if (el) el.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === name);
  });

  // Update title
  const titles = {
    home: 'Beranda', buat: 'Buat Laporan', riwayat: 'Riwayat', profil: 'Profil',
    a_home: 'Dashboard', a_laporan: 'Kelola Laporan', a_user: 'Kelola TA'
  };
  const pt = document.getElementById('pageTitle');
  if (pt && titles[name]) pt.textContent = titles[name];

  // Load data
  if (name === 'home') loadTADashboard();
  if (name === 'buat') loadBuatForm();
  if (name === 'riwayat') loadLaporan();
  if (name === 'profil') loadProfil();
  if (name === 'a_home') loadAdminDash();
  if (name === 'a_laporan') loadAdminReports();
  if (name === 'a_user') loadAdminUsers();
}

// ============================================================
// AUTH
// ============================================================
function checkAuth(role) {
  return new Promise((resolve, reject) => {
    auth.onAuthStateChanged(async user => {
      if (!user) { location.href = 'index.html'; return reject('no auth'); }
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (!doc.exists) {
          showToast('Data user tidak ditemukan', 'error');
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

function logout() {
  if (confirm('Keluar dari aplikasi?')) {
    auth.signOut().then(() => location.href = 'index.html').catch(e => showToast(e.message, 'error'));
  }
}

function confirmLogout() {
  if (confirm('Keluar dari aplikasi?')) {
    auth.signOut().then(() => location.href = 'index.html').catch(e => showToast(e.message, 'error'));
  }
}

async function doLogin() {
  const email = $v('loginEmail'), pw = $v('loginPassword');
  if (!email || !pw) return showToast('Isi email dan password', 'error');
  showLoading();
  try {
    const res = await auth.signInWithEmailAndPassword(email, pw);
    const doc = await db.collection('users').doc(res.user.uid).get();
    if (!doc.exists) {
      hideLoading();
      showToast('Data user tidak ditemukan', 'error');
      auth.signOut();
      return;
    }
    const u = doc.data();
    if (u.status === 'pending') {
      hideLoading();
      showToast('Akun belum di-approve. Hubungi admin.', 'warning');
      auth.signOut();
      return;
    }
    if (u.status === 'rejected') {
      hideLoading();
      showToast('Akun ditolak oleh admin', 'error');
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
      'auth/too-many-requests': 'Terlalu banyak percobaan',
      'auth/network-request-failed': 'Koneksi bermasalah'
    };
    showToast(m[e.code] || ('Gagal: ' + (e.message || '')), 'error');
  }
}

async function doRegister() {
  const nama = $v('regNama'), email = $v('regEmail'), pw = $v('regPw'), cpw = $v('regPwC');
  if (!nama || !email || !pw || !cpw) return showToast('Semua field wajib diisi', 'error');
  if (pw.length < 6) return showToast('Password minimal 6 karakter', 'error');
  if (pw !== cpw) return showToast('Konfirmasi password tidak cocok', 'error');
  showLoading();
  try {
    const r = await auth.createUserWithEmailAndPassword(email, pw);
    await db.collection('users').doc(r.user.uid).set({
      email: email,
      nama: nama,
      role: 'ta',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await auth.signOut();
    hideLoading();
    showToast('Pendaftaran berhasil! Tunggu approval admin.', 'success');
    switchAuthTab('login');
  } catch (e) {
    hideLoading();
    if (auth.currentUser && e.code && !e.code.startsWith('auth/')) {
      try { await auth.currentUser.delete(); } catch (delErr) {}
    }
    const m = {
      'auth/email-already-in-use': 'Email sudah terdaftar',
      'auth/invalid-email': 'Format email tidak valid',
      'auth/weak-password': 'Password terlalu lemah',
      'auth/operation-not-allowed': 'Email/Password auth belum diaktifkan',
      'auth/network-request-failed': 'Koneksi bermasalah',
      'auth/too-many-requests': 'Terlalu banyak percobaan'
    };
    showToast(m[e.code] || ('Gagal: ' + (e.message || '')), 'error');
  }
}

function switchAuthTab(t) {
  document.getElementById('formLogin').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('formRegister').style.display = t === 'register' ? 'block' : 'none';
  document.querySelectorAll('.auth-toggle button').forEach(b => {
    b.classList.toggle('active', (t === 'login' && b.textContent === 'Masuk') || (t === 'register' && b.textContent === 'Daftar'));
  });
}

async function doResetPw() {
  const email = $v('loginEmail');
  if (!email) return showToast('Masukkan email dulu', 'error');
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Link reset password dikirim', 'success');
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
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
    console.warn('Cloudinary gagal, pakai base64:', e);
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function processFiles(input, gridId) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const f of files) {
    if (f.size > 5 * 1024 * 1024) { showToast(f.name + ' terlalu besar', 'warning'); continue; }
    if (!f.type.startsWith('image/')) { showToast(f.name + ' bukan gambar', 'warning'); continue; }
    showToast('Mengupload ' + f.name + '...', 'info');
    try {
      const url = await uploadToCloudinary(f);
      uploadedPhotos.push(url);
      const g = document.getElementById(gridId);
      const d = document.createElement('div');
      d.className = 'photo-thumb';
      d.innerHTML = `<img src="${url}"><button class="rm-btn" onclick="rmPhoto(this,'${url}')">&times;</button>`;
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
// NOTIFICATIONS
// ============================================================
function initNotifs(myUid) {
  notifUnsubscribe = db.collection('notifikasi')
    .where('target', 'in', [myUid, 'all'])
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      let count = 0;
      snap.forEach(d => { if (!d.data().isRead) count++; });
      // Update bell dots
      const dot = document.getElementById('bellDot');
      const cnt = document.getElementById('bellCount');
      if (dot) dot.classList.toggle('show', count > 0);
      if (cnt) { cnt.textContent = count; cnt.classList.toggle('show', count > 0); }
      // Update nav badge
      document.querySelectorAll('.nav-badge').forEach(b => {
        b.textContent = count; b.classList.toggle('show', count > 0);
      });
    }, err => console.warn('Notif err:', err));
}

async function markRead(notifId) {
  try { await db.collection('notifikasi').doc(notifId).update({ isRead: true }); } catch (e) {}
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
    showToast('Semua notifikasi dibaca', 'success');
    loadNotifPage();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function openNotifModal() { loadNotifPage(); openModal('notifModal'); }

function renderNotifs(snap) {
  const el = document.getElementById('notifModalBody');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><h4>Belum Ada Notifikasi</h4><p>Notifikasi terbaru muncul di sini</p></div>';
    return;
  }
  let h = '';
  snap.forEach(d => {
    const n = d.data();
    const ur = !n.isRead;
    const judul = (n.judul || '').toLowerCase();
    let icon = '📢', bg = 'var(--purple-bg)';
    if (judul.includes('disetujui') || judul.includes('akun')) { icon = '✅'; bg = 'var(--green-bg)'; }
    else if (judul.includes('ditolak')) { icon = '❌'; bg = 'var(--red-light)'; }
    else if (judul.includes('laporan baru')) { icon = '📋'; bg = 'var(--blue-bg)'; }
    else if (judul.includes('pengumuman')) { icon = '📢'; bg = 'var(--purple-bg)'; }

    h += `<div class="notif-item ${ur ? 'unread' : ''}" onclick="markRead('${d.id}')">
      <div class="notif-ic" style="background:${bg}">${icon}</div>
      <div class="notif-body">
        <div class="nb-title">${esc(n.judul || '')}</div>
        <div class="nb-msg">${esc(n.pesan || '')}</div>
        <span class="nb-time">${timeAgo(n.createdAt)}</span>
      </div>
    </div>`;
  });
  el.innerHTML = h;
}

async function loadNotifPage() {
  if (!currentUser) return;
  openModal('notifModal');
  try {
    const snap = await db.collection('notifikasi')
      .where('target', 'in', [currentUser.uid, 'all'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    renderNotifs(snap);
  } catch (e) {
    const el = document.getElementById('notifModalBody');
    if (el) el.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4></div>';
  }
}

// ============================================================
// TA MODULE
// ============================================================

// --- Dashboard ---
async function loadTADashboard() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      db.collection('laporan').where('userId', '==', uid).get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'pending').get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'approved').get(),
      db.collection('laporan').where('userId', '==', uid).where('status', '==', 'rejected').get()
    ]);

    $s('s_total', total.size);
    $s('s_pending', pending.size);
    $s('s_approved', approved.size);
    $s('s_rejected', rejected.size);

    // Recent reports as cards
    const snap = await db.collection('laporan').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(5).get();
    const container = document.getElementById('recentList');
    if (!container) return;

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
      return;
    }

    let h = '';
    snap.forEach(d => { h += renderReportCard(d.data(), d.id); });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadTADashboard error:', e);
    showToast('Gagal memuat dashboard', 'error');
  }
}

function renderReportCard(r, id) {
  const statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
  const statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
  const fotoCount = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl.length : 1) : 0;
  const iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : 'var(--orange-bg)';

  return `<div class="report-item" onclick="viewReport('${id}')">
    <div class="ri-icon" style="background:${iconBg}">📄</div>
    <div class="ri-body">
      <div class="ri-title">${esc(r.judul)}</div>
      <div class="ri-sub">${esc(r.type || 'Harian')} &middot; ${formatDate(r.tanggal)}</div>
      <div class="ri-meta">
        ${fotoCount > 0 ? '📷 ' + fotoCount + ' foto &middot; ' : ''}<span class="status status-${statusClass}">${statusText}</span>
      </div>
    </div>
  </div>`;
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
  const g = document.getElementById('pPhotoGrid');
  if (g && currentUser.photo) {
    g.innerHTML = `<div class="photo-thumb"><img src="${currentUser.photo}"></div>`;
  } else if (g) {
    g.innerHTML = '';
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
    await db.collection('users').doc(currentUser.uid).update({
      nama, nip, jabatan, wilayah, nohp, alamat, photo
    });
    currentUser.nama = nama;
    currentUser.jabatan = jabatan;
    document.getElementById('profileName').textContent = nama;
    document.getElementById('profileAvatar').textContent = nama.charAt(0).toUpperCase();
    document.getElementById('welcomeName').textContent = 'Halo, ' + nama + '!';
    hideLoading();
    showToast('Profil berhasil disimpan!', 'success');
    switchPage('home');
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
  $sv('rNama', currentUser.nama || currentUser.email || '');
  $sv('rTanggal', new Date().toISOString().split('T')[0]);
}

async function submitReport() {
  const nama = currentUser.nama || $v('rNama');
  const judul = $v('rJudul');
  const isi = $v('rIsi');
  const type = document.getElementById('rType').value;
  const tanggal = $v('rTanggal');

  if (!judul || !isi || !tanggal) {
    return showToast('Judul, isi, dan tanggal wajib diisi', 'error');
  }

  showLoading();
  try {
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

    // Notify admin
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

    // Clear form
    $sv('rJudul', '');
    $sv('rIsi', '');
    uploadedPhotos = [];
    document.getElementById('rPhotoGrid').innerHTML = '';

    switchPage('riwayat');
  } catch (e) {
    hideLoading();
    console.error('submitReport error:', e);
    showToast('Gagal mengirim: ' + e.message, 'error');
  }
}

// --- Riwayat Laporan ---
async function loadLaporan() {
  if (!currentUser) return;
  const period = document.getElementById('fPeriod') ? document.getElementById('fPeriod').value : 'all';
  const container = document.getElementById('riwayatList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    let q = db.collection('laporan');
    if (currentUser.role !== 'admin') q = q.where('userId', '==', currentUser.uid);
    if (period !== 'all') {
      const { start, end } = getDateRange(period);
      q = q.where('createdAt', '>=', start).where('createdAt', '<', end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    const snap = await q.get();

    // Stats
    let ap = 0, pe = 0;
    snap.forEach(d => {
      const s = d.data().status;
      if (s === 'approved') ap++;
      else if (s === 'pending') pe++;
    });
    $s('f_total', snap.size);
    $s('f_approved', ap);
    $s('f_pending', pe);

    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>Tidak ada laporan</h4><p>Belum ada laporan untuk periode ini</p></div>';
      return;
    }

    let h = '';
    snap.forEach(d => { h += renderReportCard(d.data(), d.id); });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadLaporan error:', e);
    container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
  }
}

// --- View Report Detail ---
async function viewReport(id) {
  const body = document.getElementById('reportModalBody');
  if (!body) return;
  body.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';
  openModal('reportModal');

  try {
    const doc = await db.collection('laporan').doc(id).get();
    if (!doc.exists) { body.innerHTML = '<p style="text-align:center;color:var(--text3)">Tidak ditemukan</p>'; return; }
    const r = doc.data();
    const statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
    const statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';

    // Photos
    let photos = '';
    const fotoList = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl : [r.fotoUrl]) : [];
    if (fotoList.length > 0) {
      photos = `<div class="detail-field mt-16"><label>Foto Kegiatan (${fotoList.length})</label>
        <div class="photo-grid">${fotoList.map(f => `<div class="photo-thumb"><img src="${f}" onclick="openLightbox('${f}')" loading="lazy"></div>`).join('')}</div></div>`;
    }

    body.innerHTML = `
      <div class="flex justify-between items-center mb-16">
        <span class="status status-${statusClass}" style="font-size:12px;padding:5px 14px">${statusText}</span>
        <span class="text-xs text-muted">${formatDateTime(r.createdAt)}</span>
      </div>
      <div class="detail-field"><label>Tenaga Ahli</label><p><b>${esc(r.nama || '-')}</b></p></div>
      <div class="detail-field"><label>Tanggal</label><p>${formatDate(r.tanggal)}</p></div>
      <div class="detail-field"><label>Tipe</label><p>${esc(r.type || 'Harian')}</p></div>
      <div class="detail-field"><label>Judul</label><p><b>${esc(r.judul)}</b></p></div>
      <div class="detail-field"><label>Isi Laporan</label><div class="detail-isi">${esc(r.isi)}</div></div>
      ${r.catatanAdmin ? `<div class="detail-field"><label>Catatan Admin</label><div class="detail-note">${esc(r.catatanAdmin)}</div></div>` : ''}
      ${photos}
      ${currentUser && currentUser.role === 'admin' && r.status === 'pending' ? `
        <div class="mt-16" style="padding-top:16px;border-top:1px solid var(--border)">
          <div class="detail-field"><label>Catatan (opsional)</label><textarea id="adminNote" class="form-input" rows="3" placeholder="Catatan admin..."></textarea></div>
          <div class="flex gap-8">
            <button class="btn btn-green btn-block" onclick="approveReport('${id}')">✓ Setujui</button>
            <button class="btn btn-red btn-block" onclick="rejectReport('${id}')">✗ Tolak</button>
          </div>
        </div>` : ''}
    `;
  } catch (e) {
    console.error('viewReport error:', e);
    body.innerHTML = '<p style="text-align:center;color:var(--text3)">Gagal memuat</p>';
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

    $s('a_totalTA', taSnap.size);
    $s('a_pendUser', pendSnap.size);
    $s('a_totalRep', totalSnap.size);
    $s('a_pendRep', pRepSnap.size);
    $s('a_okRep', aRepSnap.size);
    $s('a_monthRep', mRep.size);

    const el = document.getElementById('pendUsers');
    if (!pendSnap.size) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><h4>Tidak ada permintaan baru</h4></div>';
    } else {
      let h = '';
      pendSnap.forEach(d => {
        const u = d.data();
        h += `<div class="pend-user">
          <div class="pu-info">
            <div class="pu-name">${esc(u.nama || u.email)}</div>
            <div class="pu-email">${esc(u.email)} &middot; ${timeAgo(u.createdAt)}</div>
          </div>
          <div class="pu-actions">
            <button class="btn btn-green btn-sm" onclick="approveUser('${d.id}')">Setujui</button>
            <button class="btn btn-red btn-sm" onclick="rejectUser('${d.id}')">Tolak</button>
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
    await db.collection('notifikasi').add({
      judul: 'Akun Disetujui',
      pesan: 'Selamat ' + name + '! Akun Anda telah disetujui.',
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
      pesan: 'Maaf ' + name + ', akun Anda ditolak.' + (reason ? ' Alasan: ' + reason : ''),
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
  const container = document.getElementById('adminRepList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    let q = db.collection('laporan');
    if (period !== 'all') {
      const { start, end } = getDateRange(period);
      q = q.where('createdAt', '>=', start).where('createdAt', '<', end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    const snap = await q.get();

    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>Tidak ada laporan</h4></div>';
      return;
    }

    let h = '';
    snap.forEach(d => {
      const r = d.data();
      const statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
      const statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      const iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : 'var(--orange-bg)';

      h += `<div class="report-item" onclick="viewReport('${d.id}')">
        <div class="ri-icon" style="background:${iconBg}">📄</div>
        <div class="ri-body">
          <div class="ri-title">${esc(r.judul)}</div>
          <div class="ri-sub">${esc(r.nama || '-')} &middot; ${formatDate(r.tanggal)}</div>
          <div class="ri-meta">
            <span class="status status-${statusClass}">${statusText}</span>
            ${r.status === 'pending' ? ` &middot; <button class="btn btn-green btn-sm" onclick="event.stopPropagation();quickApprove('${d.id}')">✓</button> <button class="btn btn-red btn-sm" onclick="event.stopPropagation();quickReject('${d.id}')">✗</button>` : ''}
          </div>
        </div>
      </div>`;
    });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadAdminReports error:', e);
    container.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4></div>';
  }
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUserList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    const snap = await db.collection('users').where('role', '==', 'ta').orderBy('createdAt', 'desc').get();
    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h4>Belum ada Tenaga Ahli</h4></div>';
      return;
    }

    let h = '';
    snap.forEach(d => {
      const u = d.data();
      const statusClass = u.status === 'active' ? 'active' : u.status === 'rejected' ? 'rejected' : 'pending';
      const statusText = u.status === 'active' ? 'Aktif' : u.status === 'rejected' ? 'Ditolak' : 'Menunggu';

      h += `<div class="pend-user">
        <div class="pu-info">
          <div class="pu-name">${esc(u.nama || '-')}</div>
          <div class="pu-email">${esc(u.email)} &middot; ${u.jabatan || '-'}</div>
        </div>
        <div class="pu-actions">
          <span class="status status-${statusClass}">${statusText}</span>
          ${u.status === 'pending' ? `
            <button class="btn btn-green btn-sm" onclick="approveUser('${d.id}')">✓</button>
            <button class="btn btn-red btn-sm" onclick="rejectUser('${d.id}')">✗</button>
          ` : ''}
        </div>
      </div>`;
    });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadAdminUsers error:', e);
    container.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4></div>';
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
      pesan: 'Laporan "' + r.judul + '" telah disetujui.' + (note ? ' Catatan: ' + note : ''),
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Laporan disetujui', 'success');
    closeModal('reportModal');
    if (typeof loadAdminReports === 'function') loadAdminReports();
    if (typeof loadAdminDash === 'function') loadAdminDash();
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function rejectReport(id) {
  const note = document.getElementById('adminNote') ? $v('adminNote') : '';
  const reason = note || prompt('Alasan penolakan:');
  if (!reason) return showToast('Masukkan alasan', 'error');
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'rejected', catatanAdmin: reason });
    const doc = await db.collection('laporan').doc(id).get();
    const r = doc.data();
    await db.collection('notifikasi').add({
      judul: 'Laporan Ditolak',
      pesan: 'Laporan "' + r.judul + '" ditolak. Catatan: ' + reason,
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Laporan ditolak', 'success');
    closeModal('reportModal');
    if (typeof loadAdminReports === 'function') loadAdminReports();
    if (typeof loadAdminDash === 'function') loadAdminDash();
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
      pesan: 'Laporan "' + r.judul + '" telah disetujui.',
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
      pesan: 'Laporan "' + r.judul + '" ditolak. Catatan: ' + reason,
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
async function sendBroadcast() {
  const title = $v('bcTitle'), msg = $v('bcMsg');
  if (!title || !msg) return showToast('Judul dan pesan wajib diisi', 'error');
  showLoading();
  try {
    const snap = await db.collection('users').where('role', '==', 'ta').where('status', '==', 'active').get();
    const batch = db.batch();
    snap.forEach(d => {
      batch.add(db.collection('notifikasi'), {
        judul: title,
        pesan: msg,
        target: d.id,
        userId: currentUser.uid,
        isRead: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    hideLoading();
    showToast('Broadcast terkirim ke ' + snap.size + ' TA', 'success');
    closeModal('bcModal');
    $sv('bcTitle', ''); $sv('bcMsg', '');
  } catch (e) {
    hideLoading();
    showToast('Gagal: ' + e.message, 'error');
  }
}

function printPage() { window.print(); }
