// ============================================================
// PDI TA App - All-in-One JavaScript (Real-Time Edition v4)
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

// Real-time cached data
let taReportUnsub = null;
let adminReportUnsub = null;
let adminUserUnsub = null;
let cachedTAReports = [];
let cachedAdminReports = [];
let cachedAdminUsers = [];

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
    end: firebase.firestore.Timestamp.fromDate(e),
    startDate: s,
    endDate: e
  };
}

// Filter cached reports by period (client-side)
function filterByPeriod(reports, period) {
  if (period === 'all') return reports;
  const { startDate, endDate } = getDateRange(period);
  return reports.filter(r => {
    if (!r.createdAt) return false;
    const ts = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
    return ts >= startDate && ts < endDate;
  });
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type) {
  type = type || 'info';
  let c = document.getElementById('toastArea');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastArea';
    c.className = 'toast-area';
    document.body.appendChild(c);
  }
  const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };
  const t = document.createElement('div');
  t.className = 'toast-msg toast-' + type;
  t.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    t.style.transition = '.3s';
    setTimeout(function() { t.remove(); }, 300);
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
  lb.onclick = function() { lb.remove(); };
  lb.innerHTML = '<img src="' + src + '" style="max-width:92vw;max-height:92vh;border-radius:12px;object-fit:contain;">';
  document.body.appendChild(lb);
}

// ============================================================
// REAL-TIME LISTENERS
// ============================================================

// --- Cleanup all listeners ---
function cleanupListeners() {
  if (taReportUnsub) { taReportUnsub(); taReportUnsub = null; }
  if (adminReportUnsub) { adminReportUnsub(); adminReportUnsub = null; }
  if (adminUserUnsub) { adminUserUnsub(); adminUserUnsub = null; }
  if (notifUnsubscribe) { notifUnsubscribe(); notifUnsubscribe = null; }
  cachedTAReports = [];
  cachedAdminReports = [];
  cachedAdminUsers = [];
}

// --- TA Real-time: Listen to own reports ---
function initTARealtime() {
  if (!currentUser || currentUser.role !== 'ta') return;
  if (taReportUnsub) taReportUnsub();

  const uid = currentUser.uid;
  taReportUnsub = db.collection('laporan')
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .onSnapshot(function(snap) {
      cachedTAReports = [];
      snap.forEach(function(d) {
        cachedTAReports.push({ id: d.id, data: d.data() });
      });
      // Auto-update UI based on current active tab
      renderTADashboard();
      renderRiwayat();
    }, function(err) {
      console.error('TA realtime error:', err);
      // On error, show empty state instead of stuck "Memuat..."
      var container = document.getElementById('recentList');
      if (container && container.querySelector('.empty-state') === null && container.textContent.indexOf('Memuat') >= 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
      }
    });
}

// --- Admin Real-time: Listen to all reports ---
function initAdminReportRealtime() {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (adminReportUnsub) adminReportUnsub();

  adminReportUnsub = db.collection('laporan')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(function(snap) {
      cachedAdminReports = [];
      snap.forEach(function(d) {
        cachedAdminReports.push({ id: d.id, data: d.data() });
      });
      renderAdminDashStats();
      renderAdminReportList();
    }, function(err) {
      console.error('Admin reports realtime error:', err);
      var container = document.getElementById('adminRepList');
      if (container && container.textContent.indexOf('Memuat') >= 0) {
        container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
      }
    });
}

// --- Admin Real-time: Listen to all TA users ---
function initAdminUserRealtime() {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (adminUserUnsub) adminUserUnsub();

  adminUserUnsub = db.collection('users')
    .where('role', '==', 'ta')
    .orderBy('createdAt', 'desc')
    .onSnapshot(function(snap) {
      cachedAdminUsers = [];
      snap.forEach(function(d) {
        cachedAdminUsers.push({ id: d.id, data: d.data() });
      });
      renderAdminDashUsers();
      renderAdminUserList();
    }, function(err) {
      console.error('Admin users realtime error:', err);
      var container = document.getElementById('adminUserList');
      if (container && container.textContent.indexOf('Memuat') >= 0) {
        container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
      }
    });
}

// --- Init all admin listeners ---
function initAdminRealtime() {
  initAdminReportRealtime();
  initAdminUserRealtime();
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function switchPage(name) {
  // Hide all pages
  document.querySelectorAll('.tab-page').forEach(function(p) { p.classList.remove('active'); });
  // Show selected
  var el = document.getElementById('page_' + name);
  if (el) el.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.page === name);
  });

  // Update title
  var titles = {
    home: 'Beranda', buat: 'Buat Laporan', riwayat: 'Riwayat', profil: 'Profil',
    a_home: 'Dashboard', a_laporan: 'Kelola Laporan', a_user: 'Kelola TA'
  };
  var pt = document.getElementById('pageTitle');
  if (pt && titles[name]) pt.textContent = titles[name];

  // For real-time, just re-render from cached data (no fetch needed)
  if (name === 'home') renderTADashboard();
  if (name === 'buat') loadBuatForm();
  if (name === 'riwayat') renderRiwayat();
  if (name === 'profil') loadProfil();
  if (name === 'a_home') { renderAdminDashStats(); renderAdminDashUsers(); }
  if (name === 'a_laporan') renderAdminReportList();
  if (name === 'a_user') renderAdminUserList();
}

// ============================================================
// AUTH
// ============================================================
function checkAuth(role) {
  return new Promise(function(resolve, reject) {
    auth.onAuthStateChanged(async function(user) {
      if (!user) { location.href = 'index.html'; return reject('no auth'); }
      try {
        var doc = await db.collection('users').doc(user.uid).get();
        if (!doc.exists) {
          showToast('Data user tidak ditemukan', 'error');
          auth.signOut();
          location.href = 'index.html';
          return reject('no data');
        }
        var u = doc.data();
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
        currentUser = { uid: user.uid, email: user.email, role: u.role, ...u };
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
    cleanupListeners();
    auth.signOut().then(function() { location.href = 'index.html'; }).catch(function(e) { showToast(e.message, 'error'); });
  }
}

function confirmLogout() {
  logout();
}

async function doLogin() {
  var email = $v('loginEmail'), pw = $v('loginPassword');
  if (!email || !pw) return showToast('Isi email dan password', 'error');
  showLoading();
  try {
    var res = await auth.signInWithEmailAndPassword(email, pw);
    var doc = await db.collection('users').doc(res.user.uid).get();
    if (!doc.exists) {
      hideLoading();
      showToast('Data user tidak ditemukan', 'error');
      auth.signOut();
      return;
    }
    var u = doc.data();
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
    var m = {
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
  var nama = $v('regNama'), email = $v('regEmail'), pw = $v('regPw'), cpw = $v('regPwC');
  if (!nama || !email || !pw || !cpw) return showToast('Semua field wajib diisi', 'error');
  if (pw.length < 6) return showToast('Password minimal 6 karakter', 'error');
  if (pw !== cpw) return showToast('Konfirmasi password tidak cocok', 'error');
  showLoading();
  try {
    var r = await auth.createUserWithEmailAndPassword(email, pw);
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
    var m = {
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
  document.querySelectorAll('.auth-toggle button').forEach(function(b) {
    b.classList.toggle('active', (t === 'login' && b.textContent === 'Masuk') || (t === 'register' && b.textContent === 'Daftar'));
  });
}

async function doResetPw() {
  var email = $v('loginEmail');
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
  var fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  try {
    var r = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd });
    if (r.ok) { var d = await r.json(); return d.secure_url; }
  } catch (e) {
    console.warn('Cloudinary gagal, pakai base64:', e);
  }
  return new Promise(function(res, rej) {
    var fr = new FileReader();
    fr.onload = function() { res(fr.result); };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function processFiles(input, gridId) {
  var files = Array.from(input.files);
  if (!files.length) return;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.size > 5 * 1024 * 1024) { showToast(f.name + ' terlalu besar', 'warning'); continue; }
    if (!f.type.startsWith('image/')) { showToast(f.name + ' bukan gambar', 'warning'); continue; }
    showToast('Mengupload ' + f.name + '...', 'info');
    try {
      var url = await uploadToCloudinary(f);
      uploadedPhotos.push(url);
      var g = document.getElementById(gridId);
      var d = document.createElement('div');
      d.className = 'photo-thumb';
      d.innerHTML = '<img src="' + url + '"><button class="rm-btn" onclick="rmPhoto(this,\'' + url + '\')">&times;</button>';
      g.appendChild(d);
      showToast('Foto berhasil diupload', 'success');
    } catch (e) { showToast('Gagal upload ' + f.name, 'error'); }
  }
  input.value = '';
}

function rmPhoto(btn, url) {
  uploadedPhotos = uploadedPhotos.filter(function(u) { return u !== url; });
  btn.parentElement.remove();
}

// ============================================================
// NOTIFICATIONS (FIXED: includes 'admin' target for admin users)
// ============================================================
function initNotifs(myUid, isAdmin) {
  if (notifUnsubscribe) { notifUnsubscribe(); notifUnsubscribe = null; }
  // For admin, also listen to target='admin' (string used by TAs when sending reports)
  var targets = isAdmin ? [myUid, 'admin', 'all'] : [myUid, 'all'];
  notifUnsubscribe = db.collection('notifikasi')
    .where('target', 'in', targets)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(function(snap) {
      var count = 0;
      snap.forEach(function(d) { if (!d.data().isRead) count++; });
      // Update bell dots
      var dot = document.getElementById('bellDot');
      var cnt = document.getElementById('bellCount');
      if (dot) dot.classList.toggle('show', count > 0);
      if (cnt) { cnt.textContent = count; cnt.classList.toggle('show', count > 0); }
      // Update nav badge
      document.querySelectorAll('.nav-badge').forEach(function(b) {
        b.textContent = count; b.classList.toggle('show', count > 0);
      });
    }, function(err) { console.warn('Notif listener error:', err); });
}

async function markRead(notifId) {
  try { await db.collection('notifikasi').doc(notifId).update({ isRead: true }); } catch (e) {}
}

async function markAllRead(myUid) {
  if (!currentUser) return;
  try {
    var isAdmin = currentUser.role === 'admin';
    var targets = isAdmin ? [myUid, 'admin', 'all'] : [myUid, 'all'];
    var snap = await db.collection('notifikasi')
      .where('target', 'in', targets)
      .where('isRead', '==', false)
      .get();
    var batch = db.batch();
    snap.forEach(function(d) { batch.update(d.ref, { isRead: true }); });
    if (snap.size > 0) await batch.commit();
    showToast('Semua notifikasi dibaca', 'success');
    loadNotifPage();
  } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
}

function openNotifModal() { loadNotifPage(); openModal('notifModal'); }

function renderNotifs(snap) {
  var el = document.getElementById('notifModalBody');
  if (!el) return;
  if (snap.empty) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDD14</div><h4>Belum Ada Notifikasi</h4><p>Notifikasi terbaru muncul di sini</p></div>';
    return;
  }
  var h = '';
  snap.forEach(function(d) {
    var n = d.data();
    var ur = !n.isRead;
    var judul = (n.judul || '').toLowerCase();
    var icon = '\uD83D\uDCE2', bg = 'var(--purple-bg)';
    if (judul.indexOf('disetujui') >= 0 || judul.indexOf('akun') >= 0) { icon = '\u2705'; bg = 'var(--green-bg)'; }
    else if (judul.indexOf('ditolak') >= 0) { icon = '\u274C'; bg = 'var(--red-light)'; }
    else if (judul.indexOf('laporan baru') >= 0) { icon = '\uD83D\uDCCB'; bg = 'var(--blue-bg)'; }
    else if (judul.indexOf('pengumuman') >= 0) { icon = '\uD83D\uDCE2'; bg = 'var(--purple-bg)'; }

    h += '<div class="notif-item ' + (ur ? 'unread' : '') + '" onclick="markRead(\'' + d.id + '\')">' +
      '<div class="notif-ic" style="background:' + bg + '">' + icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="nb-title">' + esc(n.judul || '') + '</div>' +
        '<div class="nb-msg">' + esc(n.pesan || '') + '</div>' +
        '<span class="nb-time">' + timeAgo(n.createdAt) + '</span>' +
      '</div>' +
    '</div>';
  });
  el.innerHTML = h;
}

async function loadNotifPage() {
  if (!currentUser) return;
  openModal('notifModal');
  try {
    var isAdmin = currentUser.role === 'admin';
    var targets = isAdmin ? [currentUser.uid, 'admin', 'all'] : [currentUser.uid, 'all'];
    var snap = await db.collection('notifikasi')
      .where('target', 'in', targets)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    renderNotifs(snap);
  } catch (e) {
    var el = document.getElementById('notifModalBody');
    if (el) el.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4></div>';
  }
}

// ============================================================
// TA MODULE (Real-Time)
// ============================================================

// --- Render TA Dashboard from cached data ---
function renderTADashboard() {
  var total = cachedTAReports.length;
  var pending = 0, approved = 0, rejected = 0;
  cachedTAReports.forEach(function(item) {
    if (item.data.status === 'pending') pending++;
    else if (item.data.status === 'approved') approved++;
    else if (item.data.status === 'rejected') rejected++;
  });

  $s('s_total', total);
  $s('s_pending', pending);
  $s('s_approved', approved);
  $s('s_rejected', rejected);

  // Recent 5 reports
  var container = document.getElementById('recentList');
  if (!container) return;

  if (!cachedTAReports.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
    return;
  }

  var h = '';
  var limit = Math.min(5, cachedTAReports.length);
  for (var i = 0; i < limit; i++) {
    h += renderReportCard(cachedTAReports[i].data, cachedTAReports[i].id);
  }
  container.innerHTML = h;
}

// --- Render Riwayat from cached data (with period filter) ---
function renderRiwayat() {
  var periodEl = document.getElementById('fPeriod');
  var period = periodEl ? periodEl.value : 'all';
  var filtered = filterByPeriod(cachedTAReports, period);

  // Stats for filtered data
  var ap = 0, pe = 0;
  filtered.forEach(function(item) {
    if (item.data.status === 'approved') ap++;
    else if (item.data.status === 'pending') pe++;
  });
  $s('f_total', filtered.length);
  $s('f_approved', ap);
  $s('f_pending', pe);

  var container = document.getElementById('riwayatList');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4><p>Belum ada laporan untuk periode ini</p></div>';
    return;
  }

  var h = '';
  filtered.forEach(function(item) {
    h += renderReportCard(item.data, item.id);
  });
  container.innerHTML = h;
}

// Fallback: load data once (used if real-time not active)
async function loadTADashboard() {
  if (!currentUser) return;
  // If realtime is active, just re-render
  if (taReportUnsub) { renderTADashboard(); return; }
  var uid = currentUser.uid;
  try {
    var total = await db.collection('laporan').where('userId', '==', uid).get();
    var pending = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'pending').get();
    var approved = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'approved').get();
    var rejected = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'rejected').get();

    $s('s_total', total.size);
    $s('s_pending', pending.size);
    $s('s_approved', approved.size);
    $s('s_rejected', rejected.size);

    var snap = await db.collection('laporan').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(5).get();
    var container = document.getElementById('recentList');
    if (!container) return;

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
      return;
    }

    var h = '';
    snap.forEach(function(d) { h += renderReportCard(d.data(), d.id); });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadTADashboard error:', e);
    showToast('Gagal memuat dashboard', 'error');
    var container = document.getElementById('recentList');
    if (container) container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
  }
}

function renderReportCard(r, id) {
  var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
  var statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
  var fotoCount = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl.length : 1) : 0;
  var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : 'var(--orange-bg)';

  return '<div class="report-item" onclick="viewReport(\'' + id + '\')">' +
    '<div class="ri-icon" style="background:' + iconBg + '">\uD83D\uDCC4</div>' +
    '<div class="ri-body">' +
      '<div class="ri-title">' + esc(r.judul) + '</div>' +
      '<div class="ri-sub">' + esc(r.type || 'Harian') + ' &middot; ' + formatDate(r.tanggal) + '</div>' +
      '<div class="ri-meta">' +
        (fotoCount > 0 ? '\uD83D\uDCF7 ' + fotoCount + ' foto &middot; ' : '') +
        '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
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
  var g = document.getElementById('pPhotoGrid');
  if (g && currentUser.photo) {
    g.innerHTML = '<div class="photo-thumb"><img src="' + currentUser.photo + '"></div>';
  } else if (g) {
    g.innerHTML = '';
  }
  uploadedPhotos = [];
}

async function saveProfil() {
  var nama = $v('pNama'), nip = $v('pNip'), jabatan = $v('pJabatan');
  var wilayah = $v('pWilayah'), nohp = $v('pNohp'), alamat = $v('pAlamat');
  if (!nama || !jabatan) return showToast('Nama dan Jabatan wajib diisi', 'error');
  showLoading();
  try {
    var photo = uploadedPhotos[0] || currentUser.photo || '';
    await db.collection('users').doc(currentUser.uid).update({
      nama: nama, nip: nip, jabatan: jabatan, wilayah: wilayah, nohp: nohp, alamat: alamat, photo: photo
    });
    currentUser.nama = nama;
    currentUser.jabatan = jabatan;
    currentUser.photo = photo;
    document.getElementById('profileName').textContent = nama;
    document.getElementById('profileAvatar').textContent = nama.charAt(0).toUpperCase();
    var welcomeEl = document.getElementById('welcomeName');
    if (welcomeEl) welcomeEl.textContent = 'Halo, ' + nama + '!';
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
  var g = document.getElementById('rPhotoGrid');
  if (g) g.innerHTML = '';
  $sv('rNama', currentUser.nama || currentUser.email || '');
  $sv('rTanggal', new Date().toISOString().split('T')[0]);
}

async function submitReport() {
  var nama = currentUser.nama || $v('rNama');
  var judul = $v('rJudul');
  var isi = $v('rIsi');
  var type = document.getElementById('rType').value;
  var tanggal = $v('rTanggal');

  if (!judul || !isi || !tanggal) {
    return showToast('Judul, isi, dan tanggal wajib diisi', 'error');
  }

  showLoading();
  try {
    var fotoUrl = uploadedPhotos.length > 0 ? uploadedPhotos.slice() : [];

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

    // Notify admin (target = 'admin' string)
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

    // Switch to riwayat - real-time listener will auto-update data
    switchPage('riwayat');
  } catch (e) {
    hideLoading();
    console.error('submitReport error:', e);
    showToast('Gagal mengirim: ' + e.message, 'error');
  }
}

// --- Riwayat Laporan (fallback if no realtime) ---
async function loadLaporan() {
  if (!currentUser) return;
  // If realtime is active, just re-render with current filter
  if (taReportUnsub) { renderRiwayat(); return; }
  var period = document.getElementById('fPeriod') ? document.getElementById('fPeriod').value : 'all';
  var container = document.getElementById('riwayatList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var q = db.collection('laporan');
    if (currentUser.role !== 'admin') q = q.where('userId', '==', currentUser.uid);
    if (period !== 'all') {
      var range = getDateRange(period);
      q = q.where('createdAt', '>=', range.start).where('createdAt', '<', range.end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    var snap = await q.get();

    var ap = 0, pe = 0;
    snap.forEach(function(d) {
      var s = d.data().status;
      if (s === 'approved') ap++;
      else if (s === 'pending') pe++;
    });
    $s('f_total', snap.size);
    $s('f_approved', ap);
    $s('f_pending', pe);

    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4><p>Belum ada laporan untuk periode ini</p></div>';
      return;
    }

    var h = '';
    snap.forEach(function(d) { h += renderReportCard(d.data(), d.id); });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadLaporan error:', e);
    container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
  }
}

// --- View Report Detail ---
async function viewReport(id) {
  var body = document.getElementById('reportModalBody');
  if (!body) return;
  body.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';
  openModal('reportModal');

  try {
    var doc = await db.collection('laporan').doc(id).get();
    if (!doc.exists) { body.innerHTML = '<p style="text-align:center;color:var(--text3)">Tidak ditemukan</p>'; return; }
    var r = doc.data();
    var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
    var statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';

    // Photos
    var photos = '';
    var fotoList = r.fotoUrl ? (Array.isArray(r.fotoUrl) ? r.fotoUrl : [r.fotoUrl]) : [];
    if (fotoList.length > 0) {
      var photoItems = '';
      fotoList.forEach(function(f) {
        photoItems += '<div class="photo-thumb"><img src="' + f + '" onclick="openLightbox(\'' + f + '\')" loading="lazy"></div>';
      });
      photos = '<div class="detail-field mt-16"><label>Foto Kegiatan (' + fotoList.length + ')</label><div class="photo-grid">' + photoItems + '</div></div>';
    }

    // Admin action buttons (only for admin on pending reports)
    var adminActions = '';
    if (currentUser && currentUser.role === 'admin' && r.status === 'pending') {
      adminActions = '<div class="mt-16" style="padding-top:16px;border-top:1px solid var(--border)">' +
        '<div class="detail-field"><label>Catatan (opsional)</label><textarea id="adminNote" class="form-input" rows="3" placeholder="Catatan admin..."></textarea></div>' +
        '<div class="flex gap-8">' +
          '<button class="btn btn-green btn-block" onclick="approveReport(\'' + id + '\')">\u2713 Setujui</button>' +
          '<button class="btn btn-red btn-block" onclick="rejectReport(\'' + id + '\')">\u2717 Tolak</button>' +
        '</div>' +
      '</div>';
    }

    body.innerHTML =
      '<div class="flex justify-between items-center mb-16">' +
        '<span class="status status-' + statusClass + '" style="font-size:12px;padding:5px 14px">' + statusText + '</span>' +
        '<span class="text-xs text-muted">' + formatDateTime(r.createdAt) + '</span>' +
      '</div>' +
      '<div class="detail-field"><label>Tenaga Ahli</label><p><b>' + esc(r.nama || '-') + '</b></p></div>' +
      '<div class="detail-field"><label>Tanggal</label><p>' + formatDate(r.tanggal) + '</p></div>' +
      '<div class="detail-field"><label>Tipe</label><p>' + esc(r.type || 'Harian') + '</p></div>' +
      '<div class="detail-field"><label>Judul</label><p><b>' + esc(r.judul) + '</b></p></div>' +
      '<div class="detail-field"><label>Isi Laporan</label><div class="detail-isi">' + esc(r.isi) + '</div></div>' +
      (r.catatanAdmin ? '<div class="detail-field"><label>Catatan Admin</label><div class="detail-note">' + esc(r.catatanAdmin) + '</div></div>' : '') +
      photos +
      adminActions;
  } catch (e) {
    console.error('viewReport error:', e);
    body.innerHTML = '<p style="text-align:center;color:var(--text3)">Gagal memuat</p>';
  }
}

// ============================================================
// ADMIN MODULE (Real-Time)
// ============================================================

// --- Render Admin Dashboard Stats from cached data ---
function renderAdminDashStats() {
  var totalTA = 0, pendUser = 0, totalRep = 0, pendRep = 0, okRep = 0, monthRep = 0;
  var now = new Date();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // User stats from cached users
  cachedAdminUsers.forEach(function(item) {
    totalTA++;
    if (item.data.status === 'pending') pendUser++;
  });

  // Report stats from cached reports
  cachedAdminReports.forEach(function(item) {
    totalRep++;
    if (item.data.status === 'pending') pendRep++;
    else if (item.data.status === 'approved') okRep++;
    // Monthly count
    if (item.data.createdAt) {
      var ts = item.data.createdAt.toDate ? item.data.createdAt.toDate() : new Date(item.data.createdAt);
      if (ts >= monthStart && ts < monthEnd) monthRep++;
    }
  });

  $s('a_totalTA', totalTA);
  $s('a_pendUser', pendUser);
  $s('a_totalRep', totalRep);
  $s('a_pendRep', pendRep);
  $s('a_okRep', okRep);
  $s('a_monthRep', monthRep);
}

// --- Render Admin Pending Users from cached data ---
function renderAdminDashUsers() {
  var el = document.getElementById('pendUsers');
  if (!el) return;

  var pendingUsers = cachedAdminUsers.filter(function(item) {
    return item.data.status === 'pending';
  });

  if (!pendingUsers.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2705</div><h4>Tidak ada permintaan baru</h4></div>';
    return;
  }

  var h = '';
  pendingUsers.forEach(function(item) {
    var u = item.data;
    h += '<div class="pend-user">' +
      '<div class="pu-info">' +
        '<div class="pu-name">' + esc(u.nama || u.email) + '</div>' +
        '<div class="pu-email">' + esc(u.email) + ' &middot; ' + timeAgo(u.createdAt) + '</div>' +
      '</div>' +
      '<div class="pu-actions">' +
        '<button class="btn btn-green btn-sm" onclick="approveUser(\'' + item.id + '\')">Setujui</button>' +
        '<button class="btn btn-red btn-sm" onclick="rejectUser(\'' + item.id + '\')">Tolak</button>' +
      '</div>' +
    '</div>';
  });
  el.innerHTML = h;
}

// --- Render Admin Reports from cached data (with period filter) ---
function renderAdminReportList() {
  var periodEl = document.getElementById('aPeriod');
  var period = periodEl ? periodEl.value : 'all';
  var filtered = filterByPeriod(cachedAdminReports, period);

  var container = document.getElementById('adminRepList');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4></div>';
    return;
  }

  var h = '';
  filtered.forEach(function(item) {
    var r = item.data;
    var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
    var statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
    var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : 'var(--orange-bg)';

    var quickBtns = '';
    if (r.status === 'pending' && currentUser && currentUser.role === 'admin') {
      quickBtns = ' &middot; <button class="btn btn-green btn-sm" onclick="event.stopPropagation();quickApprove(\'' + item.id + '\')">\u2713</button> <button class="btn btn-red btn-sm" onclick="event.stopPropagation();quickReject(\'' + item.id + '\')">\u2717</button>';
    }

    h += '<div class="report-item" onclick="viewReport(\'' + item.id + '\')">' +
      '<div class="ri-icon" style="background:' + iconBg + '">\uD83D\uDCC4</div>' +
      '<div class="ri-body">' +
        '<div class="ri-title">' + esc(r.judul) + '</div>' +
        '<div class="ri-sub">' + esc(r.nama || '-') + ' &middot; ' + formatDate(r.tanggal) + '</div>' +
        '<div class="ri-meta">' +
          '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
          quickBtns +
        '</div>' +
      '</div>' +
    '</div>';
  });
  container.innerHTML = h;
}

// --- Render Admin User List from cached data ---
function renderAdminUserList() {
  var container = document.getElementById('adminUserList');
  if (!container) return;

  if (!cachedAdminUsers.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDC65</div><h4>Belum ada Tenaga Ahli</h4></div>';
    return;
  }

  var h = '';
  cachedAdminUsers.forEach(function(item) {
    var u = item.data;
    var statusClass = u.status === 'active' ? 'active' : u.status === 'rejected' ? 'rejected' : 'pending';
    var statusText = u.status === 'active' ? 'Aktif' : u.status === 'rejected' ? 'Ditolak' : 'Menunggu';

    var actions = '<span class="status status-' + statusClass + '">' + statusText + '</span>';
    if (u.status === 'pending') {
      actions += ' <button class="btn btn-green btn-sm" onclick="approveUser(\'' + item.id + '\')">\u2713</button>' +
                 ' <button class="btn btn-red btn-sm" onclick="rejectUser(\'' + item.id + '\')">\u2717</button>';
    }

    h += '<div class="pend-user">' +
      '<div class="pu-info">' +
        '<div class="pu-name">' + esc(u.nama || '-') + '</div>' +
        '<div class="pu-email">' + esc(u.email) + ' &middot; ' + (u.jabatan || '-') + '</div>' +
      '</div>' +
      '<div class="pu-actions">' + actions + '</div>' +
    '</div>';
  });
  container.innerHTML = h;
}

// --- Fallback: load admin data once (used if realtime not active) ---
async function loadAdminDash() {
  if (!currentUser) return;
  if (adminReportUnsub && adminUserUnsub) { renderAdminDashStats(); renderAdminDashUsers(); return; }
  try {
    var taSnap = await db.collection('users').where('role', '==', 'ta').where('status', '==', 'active').get();
    var pendSnap = await db.collection('users').where('status', '==', 'pending').get();
    var totalSnap = await db.collection('laporan').get();
    var pRepSnap = await db.collection('laporan').where('status', '==', 'pending').get();
    var aRepSnap = await db.collection('laporan').where('status', '==', 'approved').get();
    var range = getDateRange('monthly');
    var mRep = await db.collection('laporan').where('createdAt', '>=', range.start).where('createdAt', '<', range.end).get();

    $s('a_totalTA', taSnap.size);
    $s('a_pendUser', pendSnap.size);
    $s('a_totalRep', totalSnap.size);
    $s('a_pendRep', pRepSnap.size);
    $s('a_okRep', aRepSnap.size);
    $s('a_monthRep', mRep.size);

    var el = document.getElementById('pendUsers');
    if (!pendSnap.size) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2705</div><h4>Tidak ada permintaan baru</h4></div>';
    } else {
      var h = '';
      pendSnap.forEach(function(d) {
        var u = d.data();
        h += '<div class="pend-user">' +
          '<div class="pu-info">' +
            '<div class="pu-name">' + esc(u.nama || u.email) + '</div>' +
            '<div class="pu-email">' + esc(u.email) + ' &middot; ' + timeAgo(u.createdAt) + '</div>' +
          '</div>' +
          '<div class="pu-actions">' +
            '<button class="btn btn-green btn-sm" onclick="approveUser(\'' + d.id + '\')">Setujui</button>' +
            '<button class="btn btn-red btn-sm" onclick="rejectUser(\'' + d.id + '\')">Tolak</button>' +
          '</div>' +
        '</div>';
      });
      el.innerHTML = h;
    }
  } catch (e) {
    console.error('loadAdminDash error:', e);
    showToast('Gagal memuat dashboard', 'error');
  }
}

async function approveUser(uid) {
  if (!confirm('Setujui user ini?')) return;
  showLoading();
  try {
    await db.collection('users').doc(uid).update({ status: 'active' });
    var uDoc = await db.collection('users').doc(uid).get();
    var name = uDoc.exists ? (uDoc.data().nama || uDoc.data().email) : 'User';
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
    // Real-time listener will auto-update the UI
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function rejectUser(uid) {
  var reason = prompt('Alasan penolakan (opsional):');
  if (reason === null) return;
  showLoading();
  try {
    await db.collection('users').doc(uid).update({ status: 'rejected' });
    var uDoc = await db.collection('users').doc(uid).get();
    var name = uDoc.exists ? (uDoc.data().nama || uDoc.data().email) : 'User';
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
    // Real-time listener will auto-update the UI
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

// Fallback: load admin reports once
async function loadAdminReports() {
  if (!currentUser) return;
  if (adminReportUnsub) { renderAdminReportList(); return; }
  var period = document.getElementById('aPeriod') ? document.getElementById('aPeriod').value : 'all';
  var container = document.getElementById('adminRepList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var q = db.collection('laporan');
    if (period !== 'all') {
      var range = getDateRange(period);
      q = q.where('createdAt', '>=', range.start).where('createdAt', '<', range.end);
    }
    q = q.orderBy('createdAt', 'desc').limit(100);
    var snap = await q.get();

    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4></div>';
      return;
    }

    var h = '';
    snap.forEach(function(d) {
      var r = d.data();
      var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending';
      var statusText = r.status === 'approved' ? 'Disetujui' : r.status === 'rejected' ? 'Ditolak' : 'Menunggu';
      var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : 'var(--orange-bg)';

      h += '<div class="report-item" onclick="viewReport(\'' + d.id + '\')">' +
        '<div class="ri-icon" style="background:' + iconBg + '">\uD83D\uDCC4</div>' +
        '<div class="ri-body">' +
          '<div class="ri-title">' + esc(r.judul) + '</div>' +
          '<div class="ri-sub">' + esc(r.nama || '-') + ' &middot; ' + formatDate(r.tanggal) + '</div>' +
          '<div class="ri-meta">' +
            '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
            (r.status === 'pending' ? ' &middot; <button class="btn btn-green btn-sm" onclick="event.stopPropagation();quickApprove(\'' + d.id + '\')">\u2713</button> <button class="btn btn-red btn-sm" onclick="event.stopPropagation();quickReject(\'' + d.id + '\')">\u2717</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    });
    container.innerHTML = h;
  } catch (e) {
    console.error('loadAdminReports error:', e);
    container.innerHTML = '<div class="empty-state"><h4>Gagal memuat</h4></div>';
  }
}

// Fallback: load admin users once
async function loadAdminUsers() {
  if (!currentUser) return;
  if (adminUserUnsub) { renderAdminUserList(); return; }
  var container = document.getElementById('adminUserList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var snap = await db.collection('users').where('role', '==', 'ta').orderBy('createdAt', 'desc').get();
    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDC65</div><h4>Belum ada Tenaga Ahli</h4></div>';
      return;
    }

    var h = '';
    snap.forEach(function(d) {
      var u = d.data();
      var statusClass = u.status === 'active' ? 'active' : u.status === 'rejected' ? 'rejected' : 'pending';
      var statusText = u.status === 'active' ? 'Aktif' : u.status === 'rejected' ? 'Ditolak' : 'Menunggu';

      h += '<div class="pend-user">' +
        '<div class="pu-info">' +
          '<div class="pu-name">' + esc(u.nama || '-') + '</div>' +
          '<div class="pu-email">' + esc(u.email) + ' &middot; ' + (u.jabatan || '-') + '</div>' +
        '</div>' +
        '<div class="pu-actions">' +
          '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
          (u.status === 'pending' ? ' <button class="btn btn-green btn-sm" onclick="approveUser(\'' + d.id + '\')">\u2713</button> <button class="btn btn-red btn-sm" onclick="rejectUser(\'' + d.id + '\')">\u2717</button>' : '') +
        '</div>' +
      '</div>';
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
    var note = document.getElementById('adminNote') ? $v('adminNote') : '';
    var upd = { status: 'approved' };
    if (note) upd.catatanAdmin = note;
    await db.collection('laporan').doc(id).update(upd);
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
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
    // Real-time listener will auto-update
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function rejectReport(id) {
  var note = document.getElementById('adminNote') ? $v('adminNote') : '';
  var reason = note || prompt('Alasan penolakan:');
  if (!reason) return showToast('Masukkan alasan', 'error');
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'rejected', catatanAdmin: reason });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
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
    // Real-time listener will auto-update
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickApprove(id) {
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'approved' });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
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
    // Real-time listener will auto-update
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickReject(id) {
  var reason = prompt('Alasan penolakan:');
  if (!reason) return;
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'rejected', catatanAdmin: reason });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
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
    // Real-time listener will auto-update
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

// --- Broadcast ---
async function sendBroadcast() {
  var title = $v('bcTitle'), msg = $v('bcMsg');
  if (!title || !msg) return showToast('Judul dan pesan wajib diisi', 'error');
  showLoading();
  try {
    var snap = await db.collection('users').where('role', '==', 'ta').where('status', '==', 'active').get();
    var batch = db.batch();
    snap.forEach(function(d) {
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
