// ============================================================
// PDI TA App - All-in-One JavaScript (Real-Time Edition v6)
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

// Selected reports for Word export
let selectedReportIds = new Set();

// ============================================================
// UTILITIES
// ============================================================
function $v(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function $s(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }
function $sv(id, val) { const e = document.getElementById(id); if (e) e.value = val; }

function esc(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

// v6: Improved formatDate - handles string dates like "2026-04-17" without timezone issues
function formatDate(d) {
  if (!d) return '-';
  if (typeof d === 'string') {
    var parts = d.split('-');
    if (parts.length === 3) {
      var dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return d;
  }
  var dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '-';
  var dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
  if (!d) return '';
  var dt = d.toDate ? d.toDate() : new Date(d);
  var s = Math.floor((Date.now() - dt) / 1000);
  if (s < 60) return 'Baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 604800) return Math.floor(s / 86400) + ' hari lalu';
  return formatDate(d);
}

function getDateRange(p) {
  var n = new Date();
  var s, e;
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

// ============================================================
// v6: NORMALIZE REPORT DATA
// Handles inconsistent schema: type/tipe, fotoUrl array/string/"-",
// tanggal timestamp/string, catatanAdmin string/"-"/""
// ============================================================
function normalizeReport(r) {
  if (!r) return r;
  // Normalize type field (some docs use "tipe")
  if (!r.type && r.tipe) r.type = r.tipe;
  // Normalize fotoUrl: filter out invalid values like "-" or empty strings
  if (r.fotoUrl) {
    if (Array.isArray(r.fotoUrl)) {
      r.fotoUrl = r.fotoUrl.filter(function(f) { return f && typeof f === 'string' && f.indexOf('http') === 0; });
      if (r.fotoUrl.length === 0) r.fotoUrl = [];
    } else if (typeof r.fotoUrl === 'string') {
      if (r.fotoUrl.indexOf('http') === 0) {
        r.fotoUrl = [r.fotoUrl];
      } else {
        r.fotoUrl = [];
      }
    }
  } else {
    r.fotoUrl = [];
  }
  // Normalize catatanAdmin: "-" and "" treated as no note
  if (r.catatanAdmin === '-' || r.catatanAdmin === '') r.catatanAdmin = '';
  // Normalize tanggal: ensure it's usable for display
  // (formatDate already handles both timestamp and string)
  return r;
}

// v6: Client-side sort helper for reports
function sortReportsByDate(reports) {
  return reports.sort(function(a, b) {
    var aData = a.data || a;
    var bData = b.data || b;
    var ta = aData.createdAt ? (aData.createdAt.toDate ? aData.createdAt.toDate() : new Date(aData.createdAt)) : new Date(0);
    var tb = bData.createdAt ? (bData.createdAt.toDate ? bData.createdAt.toDate() : new Date(bData.createdAt)) : new Date(0);
    return tb - ta;
  });
}

// Filter cached reports by period (client-side)
function filterByPeriod(reports, period) {
  if (period === 'all') return reports;
  var range = getDateRange(period);
  return reports.filter(function(r) {
    var createdAt = r.data ? r.data.createdAt : r.createdAt;
    if (!createdAt) return false;
    var ts = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return ts >= range.startDate && ts < range.endDate;
  });
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toastArea');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastArea';
    c.className = 'toast-area';
    document.body.appendChild(c);
  }
  var icons = { success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' };
  var t = document.createElement('div');
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
  var o = document.getElementById('loadingOverlay');
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
  var o = document.getElementById('loadingOverlay');
  if (o) o.classList.remove('show');
}

// ============================================================
// MODAL
// ============================================================
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function openLightbox(src) {
  var lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:8000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.onclick = function() { lb.remove(); };
  lb.innerHTML = '<img src="' + src + '" style="max-width:92vw;max-height:92vh;border-radius:12px;object-fit:contain;">';
  document.body.appendChild(lb);
}

// ============================================================
// REAL-TIME LISTENERS (v6: No composite orderBy - avoids index errors)
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
// v6: Removed orderBy to avoid needing composite index (userId + createdAt)
// Data is sorted client-side after fetch
function initTARealtime() {
  if (!currentUser || currentUser.role !== 'ta') return;
  if (taReportUnsub) taReportUnsub();

  var uid = currentUser.uid;
  taReportUnsub = db.collection('laporan')
    .where('userId', '==', uid)
    .limit(200)
    .onSnapshot(function(snap) {
      cachedTAReports = [];
      snap.forEach(function(d) {
        var data = normalizeReport(d.data());
        cachedTAReports.push({ id: d.id, data: data });
      });
      // Sort client-side by createdAt desc
      sortReportsByDate(cachedTAReports);
      // Auto-update UI
      renderTADashboard();
      renderRiwayat();
    }, function(err) {
      console.error('TA realtime error:', err);
      var el1 = document.getElementById('recentList');
      var el2 = document.getElementById('riwayatList');
      var emptyHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
      if (el1) el1.innerHTML = emptyHTML;
      if (el2) el2.innerHTML = emptyHTML;

      // v6: Show helpful error for missing index
      if (err.code === 'failed-precondition') {
        showToast('Index Firestore belum dibuat. Lihat console untuk link pembuatan.', 'error');
        console.error('FIRESTORE INDEX NEEDED. Open this URL to create it:', err.message);
      } else {
        showToast('Gagal memuat laporan: ' + (err.message || ''), 'error');
      }
    });
}

// --- Admin Real-time: Listen to all reports ---
// v6: Single-field orderBy is auto-indexed, no composite needed
function initAdminReportRealtime() {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (adminReportUnsub) adminReportUnsub();

  adminReportUnsub = db.collection('laporan')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .onSnapshot(function(snap) {
      cachedAdminReports = [];
      snap.forEach(function(d) {
        var data = normalizeReport(d.data());
        cachedAdminReports.push({ id: d.id, data: data });
      });
      renderAdminDashStats();
      renderAdminReportList();
    }, function(err) {
      console.error('Admin reports realtime error:', err);
      var el = document.getElementById('adminRepList');
      if (el) el.innerHTML = '<div class="empty-state"><h4>Gagal memuat laporan</h4><p>' + esc(err.message || 'Terjadi kesalahan') + '</p></div>';
      showToast('Gagal memuat laporan admin', 'error');
    });
}

// --- Admin Real-time: Listen to all TA users ---
// v6: Removed orderBy to avoid composite index (role + createdAt)
function initAdminUserRealtime() {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (adminUserUnsub) adminUserUnsub();

  adminUserUnsub = db.collection('users')
    .where('role', '==', 'ta')
    .limit(200)
    .onSnapshot(function(snap) {
      cachedAdminUsers = [];
      snap.forEach(function(d) {
        cachedAdminUsers.push({ id: d.id, data: d.data() });
      });
      // Sort client-side by createdAt desc
      cachedAdminUsers.sort(function(a, b) {
        var ta = a.data.createdAt ? (a.data.createdAt.toDate ? a.data.createdAt.toDate() : new Date(a.data.createdAt)) : new Date(0);
        var tb = b.data.createdAt ? (b.data.createdAt.toDate ? b.data.createdAt.toDate() : new Date(b.data.createdAt)) : new Date(0);
        return tb - ta;
      });
      renderAdminDashUsers();
      renderAdminUserList();
    }, function(err) {
      console.error('Admin users realtime error:', err);
      var el = document.getElementById('adminUserList');
      if (el) el.innerHTML = '<div class="empty-state"><h4>Gagal memuat data user</h4><p>' + esc(err.message || 'Terjadi kesalahan') + '</p></div>';
      showToast('Gagal memuat data user', 'error');
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
  document.querySelectorAll('.tab-page').forEach(function(p) { p.classList.remove('active'); });
  var el = document.getElementById('page_' + name);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(function(n) {
    n.classList.toggle('active', n.dataset.page === name);
  });

  var titles = {
    home: 'Beranda', buat: 'Buat Laporan', riwayat: 'Riwayat', profil: 'Profil',
    a_home: 'Dashboard', a_laporan: 'Kelola Laporan', a_user: 'Kelola TA'
  };
  var pt = document.getElementById('pageTitle');
  if (pt && titles[name]) pt.textContent = titles[name];

  if (name === 'home') renderTADashboard();
  if (name === 'buat') loadBuatForm();
  if (name === 'riwayat') renderRiwayat();
  if (name === 'profil') loadProfil();
  if (name === 'a_home') { renderAdminDashStats(); renderAdminDashUsers(); }
  if (name === 'a_laporan') { setDateToday(); setMonthThis(); renderDailyReports(); }
  if (name === 'a_user') renderAdminUserList();
}

// ============================================================
// AUTH
// ============================================================
function checkAuth(role) {
  return new Promise(function(resolve, reject) {
    var resolved = false;
    var nullTimer = null;

    var unsub = auth.onAuthStateChanged(async function(user) {
      // User found — Firebase restored the persisted session
      if (user) {
        // Cancel any pending null-check timer
        if (nullTimer) { clearTimeout(nullTimer); nullTimer = null; }
        if (resolved) return;
        try {
          var doc = await db.collection('users').doc(user.uid).get();
          if (!doc.exists) {
            showToast('Data user tidak ditemukan', 'error');
            auth.signOut();
            resolved = true;
            unsub();
            location.href = 'index.html';
            return reject('no data');
          }
          var u = doc.data();
          if (u.status !== 'active') {
            showToast('Akun belum di-approve admin', 'warning');
            auth.signOut();
            resolved = true;
            unsub();
            location.href = 'index.html';
            return reject('not active');
          }
          if (role && u.role !== role) {
            showToast('Akses ditolak', 'error');
            resolved = true;
            unsub();
            location.href = u.role === 'admin' ? 'admin.html' : 'ta.html';
            return reject('wrong role');
          }
          resolved = true;
          unsub();
          currentUser = { uid: user.uid, email: user.email, role: u.role, ...u };
          resolve(currentUser);
        } catch (e) {
          console.error('checkAuth error:', e);
          if (!resolved) { resolved = true; reject(e); }
        }
        return;
      }

      // No user yet — Firebase might still be restoring persisted session
      // Wait up to 5 seconds before giving up
      if (!resolved && !nullTimer) {
        nullTimer = setTimeout(function() {
          nullTimer = null;
          if (!resolved && !auth.currentUser) {
            resolved = true;
            unsub();
            location.href = 'index.html';
            return reject('no auth');
          }
        }, 5000);
      }
    });
  });
}

function logout() {
  if (confirm('Keluar dari aplikasi?')) {
    cleanupListeners();
    localStorage.removeItem('pdi_ta_logged_in');
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
// NOTIFICATIONS
// ============================================================
function initNotifs(myUid, isAdmin) {
  if (notifUnsubscribe) { notifUnsubscribe(); notifUnsubscribe = null; }
  var targets = isAdmin ? [myUid, 'admin', 'all'] : [myUid, 'all'];
  notifUnsubscribe = db.collection('notifikasi')
    .where('target', 'in', targets)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(function(snap) {
      var count = 0;
      snap.forEach(function(d) { if (!d.data().isRead) count++; });
      var dot = document.getElementById('bellDot');
      var cnt = document.getElementById('bellCount');
      if (dot) dot.classList.toggle('show', count > 0);
      if (cnt) { cnt.textContent = count; cnt.classList.toggle('show', count > 0); }
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
    if (judul.indexOf('diterima') >= 0 || judul.indexOf('akun') >= 0) { icon = '\u2705'; bg = 'var(--green-bg)'; }
    else if (judul.indexOf('ditolak') >= 0) { icon = '\u274C'; bg = 'var(--red-light)'; }
    else if (judul.indexOf('revisi') >= 0) { icon = '\uD83D\uDD04'; bg = 'var(--blue-bg)'; }
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

// Fallback: load TA data once (used if real-time not active)
// v6: Removed orderBy from compound query
async function loadTADashboard() {
  if (!currentUser) return;
  if (taReportUnsub) { renderTADashboard(); return; }
  var uid = currentUser.uid;
  try {
    var totalSnap = await db.collection('laporan').where('userId', '==', uid).get();
    var pendingSnap = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'pending').get();
    var approvedSnap = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'approved').get();
    var rejectedSnap = await db.collection('laporan').where('userId', '==', uid).where('status', '==', 'rejected').get();

    $s('s_total', totalSnap.size);
    $s('s_pending', pendingSnap.size);
    $s('s_approved', approvedSnap.size);
    $s('s_rejected', rejectedSnap.size);

    // Get all reports and sort client-side
    var allReports = [];
    totalSnap.forEach(function(d) { allReports.push({ id: d.id, data: normalizeReport(d.data()) }); });
    allReports.sort(function(a, b) {
      var ta = a.data.createdAt ? (a.data.createdAt.toDate ? a.data.createdAt.toDate() : new Date(a.data.createdAt)) : new Date(0);
      var tb = b.data.createdAt ? (b.data.createdAt.toDate ? b.data.createdAt.toDate() : new Date(b.data.createdAt)) : new Date(0);
      return tb - ta;
    });

    var container = document.getElementById('recentList');
    if (!container) return;

    if (!allReports.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Belum ada laporan</h4><p>Mulai buat laporan pertama Anda</p></div>';
      return;
    }

    var h = '';
    var limit = Math.min(5, allReports.length);
    for (var i = 0; i < limit; i++) {
      h += renderReportCard(allReports[i].data, allReports[i].id);
    }
    container.innerHTML = h;
  } catch (e) {
    console.error('loadTADashboard error:', e);
    showToast('Gagal memuat dashboard', 'error');
    var container = document.getElementById('recentList');
    if (container) container.innerHTML = '<div class="empty-state"><h4>Gagal memuat data</h4></div>';
  }
}

// v6: renderReportCard uses normalized data (fotoUrl already filtered, type already normalized)
function renderReportCard(r, id) {
  var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : r.status === 'revisi' ? 'revisi' : 'pending';
  var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';
  var fotoCount = (r.fotoUrl && Array.isArray(r.fotoUrl)) ? r.fotoUrl.length : 0;
  var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : r.status === 'revisi' ? 'var(--blue-bg)' : 'var(--orange-bg)';

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

// Helper: rebuild avatar UI with photo or initial letter
function updateAvatarUI(photo, initial) {
  var avatarEl = document.getElementById('profileAvatar');
  if (!avatarEl) return;
  var editIconHTML = '<div style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;background:var(--red);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.2);z-index:2;pointer-events:none">\uD83D\uDCF7</div>';

  if (photo) {
    avatarEl.innerHTML = '<img src="' + photo + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:50%">' + editIconHTML;
    avatarEl.style.background = 'none';
  } else {
    avatarEl.innerHTML = '<span style="font-size:28px;font-weight:700;color:#fff;position:relative;z-index:1">' + initial + '</span>' + editIconHTML;
    avatarEl.style.background = '';
  }
}

async function processAvatarUpload(input) {
  var file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('File harus berupa gambar', 'error');
  if (file.size > 5 * 1024 * 1024) return showToast('Ukuran maksimal 5MB', 'error');
  showLoading();
  try {
    var url = await uploadToCloudinary(file);
    uploadedPhotos = [url];
    updateAvatarUI(url, '');
    hideLoading();
    showToast('Foto berhasil diupload! Klik Simpan untuk menyimpan.', 'success');
  } catch (e) {
    hideLoading();
    showToast('Gagal upload foto: ' + (e.message || ''), 'error');
  }
  input.value = '';
}

async function loadProfil() {
  if (!currentUser) return;
  $sv('pNama', currentUser.nama || '');
  $sv('pJabatan', currentUser.jabatan || '');
  $sv('pNip', currentUser.nip || '');
  $sv('pWilayah', currentUser.wilayah || '');
  $sv('pNohp', currentUser.nohp || '');
  $sv('pAlamat', currentUser.alamat || '');

  var initial = (currentUser.nama || currentUser.email || 'T').charAt(0).toUpperCase();
  if (currentUser.photo) {
    updateAvatarUI(currentUser.photo, initial);
    uploadedPhotos = [currentUser.photo];
  } else {
    updateAvatarUI(null, initial);
    uploadedPhotos = [];
  }
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
    updateAvatarUI(photo, nama.charAt(0).toUpperCase());
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
  var now = new Date(); $sv('rTanggal', now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
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

// --- Riwayat Laporan (fallback if no realtime) ---
// v6: Removed orderBy from compound query
async function loadLaporan() {
  if (!currentUser) return;
  if (taReportUnsub) { renderRiwayat(); return; }
  var period = document.getElementById('fPeriod') ? document.getElementById('fPeriod').value : 'all';
  var container = document.getElementById('riwayatList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var q = db.collection('laporan');
    if (currentUser.role !== 'admin') q = q.where('userId', '==', currentUser.uid);
    q = q.limit(200);
    var snap = await q.get();

    // Filter and sort client-side
    var allReports = [];
    snap.forEach(function(d) { allReports.push({ id: d.id, data: normalizeReport(d.data()) }); });

    // Filter by period
    var filtered = filterByPeriod(allReports, period);

    var ap = 0, pe = 0;
    filtered.forEach(function(item) {
      if (item.data.status === 'approved') ap++;
      else if (item.data.status === 'pending') pe++;
    });
    $s('f_total', filtered.length);
    $s('f_approved', ap);
    $s('f_pending', pe);

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4><p>Belum ada laporan untuk periode ini</p></div>';
      return;
    }

    // Sort client-side
    sortReportsByDate(filtered);

    var h = '';
    filtered.forEach(function(item) { h += renderReportCard(item.data, item.id); });
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
    var r = normalizeReport(doc.data());
    var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : r.status === 'revisi' ? 'revisi' : 'pending';
    var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';

    // Photos (already normalized - fotoUrl is now always a clean array of valid URLs)
    var photos = '';
    if (r.fotoUrl && r.fotoUrl.length > 0) {
      var photoItems = '';
      r.fotoUrl.forEach(function(f) {
        photoItems += '<div class="photo-thumb"><img src="' + f + '" onclick="openLightbox(\'' + f + '\')" loading="lazy"></div>';
      });
      photos = '<div class="detail-field mt-16"><label>Foto Kegiatan (' + r.fotoUrl.length + ')</label><div class="photo-grid">' + photoItems + '</div></div>';
    }

    // Admin action buttons
    var adminActions = '';
    if (currentUser && currentUser.role === 'admin' && (r.status === 'pending' || r.status === 'revisi')) {
      adminActions = '<div class="mt-16" style="padding-top:16px;border-top:1px solid var(--border)">' +
        '<div class="detail-field"><label>Catatan (opsional)</label><textarea id="adminNote" class="form-input" rows="3" placeholder="Catatan admin..."></textarea></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-green" style="flex:1;min-width:100px" onclick="approveReport(\'' + id + '\')">\u2713 Diterima</button>' +
          '<button class="btn" style="flex:1;min-width:100px;background:var(--blue);color:#fff" onclick="reviseReport(\'' + id + '\')">\u21BB Revisi</button>' +
          '<button class="btn btn-red" style="flex:1;min-width:100px" onclick="rejectReport(\'' + id + '\')">\u2717 Ditolak</button>' +
        '</div>' +
      '</div>';
    }

    // Cetak Word button for admin
    var printBtn = '';
    if (currentUser && currentUser.role === 'admin') {
      printBtn = '<div class="mt-16 no-print" style="padding-top:16px;border-top:1px solid var(--border)">' +
        '<button class="btn btn-outline btn-block" onclick="printSingleReport(\'' + id + '\')">\uD83D\uDDA8 Cetak ke Word</button>' +
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
      adminActions +
      printBtn;
  } catch (e) {
    console.error('viewReport error:', e);
    body.innerHTML = '<p style="text-align:center;color:var(--text3)">Gagal memuat</p>';
  }
}

// ============================================================
// ADMIN MODULE (Real-Time)
// ============================================================

function renderAdminDashStats() {
  var totalTA = 0, pendUser = 0, totalRep = 0, pendRep = 0, okRep = 0, monthRep = 0;
  var now = new Date();
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  cachedAdminUsers.forEach(function(item) {
    totalTA++;
    if (item.data.status === 'pending') pendUser++;
  });

  cachedAdminReports.forEach(function(item) {
    totalRep++;
    if (item.data.status === 'pending') pendRep++;
    else if (item.data.status === 'approved') okRep++;
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

// --- Render Admin Reports grouped by TA user ---
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

  var isAdmin = currentUser && currentUser.role === 'admin';

  // Build user info lookup from cached admin users
  var userInfo = {};
  cachedAdminUsers.forEach(function(u) {
    userInfo[u.id] = u.data;
  });

  // Group reports by userId
  var grouped = {};
  filtered.forEach(function(item) {
    var uid = item.data.userId || 'unknown';
    if (!grouped[uid]) grouped[uid] = [];
    grouped[uid].push(item);
  });

  // Sort users: most reports first
  var userIds = Object.keys(grouped).sort(function(a, b) {
    return grouped[b].length - grouped[a].length;
  });

  // Header with print button
  var header = '';
  if (isAdmin && selectedReportIds.size > 0) {
    header = '<div style="padding:12px 16px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:12px;font-weight:600;color:var(--text2)">' + selectedReportIds.size + ' laporan dipilih</span>' +
      '<button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="openPrintOptions()">\uD83D\uDDA8 Cetak Word</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="clearAllReportSelections()">Batal</button>' +
    '</div>';
  }

  var h = header;
  var totalUsers = userIds.length;
  var totalReports = filtered.length;

  // Summary bar
  h += '<div style="padding:10px 16px;background:var(--red-light);border-bottom:1px solid var(--border);font-size:12px;color:var(--red-dark);font-weight:600">' +
    totalUsers + ' Tenaga Ahli &middot; ' + totalReports + ' Laporan' +
  '</div>';

  userIds.forEach(function(uid) {
    var reports = grouped[uid];
    var u = userInfo[uid] || {};
    var nama = u.nama || reports[0].data.nama || 'Unknown';
    var jabatan = u.jabatan || '-';
    var userPhoto = u.photo || '';
    var userStatus = u.status || 'active';

    // User header with avatar, name, and report count
    var avatarHtml = '';
    if (userPhoto) {
      avatarHtml = '<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;margin-right:10px"><img src="' + userPhoto + '" style="width:100%;height:100%;object-fit:cover"></div>';
    } else {
      var initial = nama.charAt(0).toUpperCase();
      avatarHtml = '<div style="width:36px;height:36px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;margin-right:10px">' + initial + '</div>';
    }

    var statusLabel = userStatus === 'active' ? '' : ' <span class="status status-' + userStatus + '" style="font-size:9px;padding:1px 6px">' + (userStatus === 'pending' ? 'Menunggu' : 'Ditolak') + '</span>';

    // Collapsible user group
    var groupId = 'ug_' + uid.replace(/[^a-zA-Z0-9]/g, '');
    h += '<div class="user-report-group" style="margin-bottom:4px">' +
      '<div class="report-item" style="background:var(--bg);cursor:pointer;border-bottom:1px solid var(--border);border-top:2px solid var(--red)" onclick="toggleUserGroup(\'' + groupId + '\')">' +
        avatarHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px">' + esc(nama) + statusLabel + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">' + esc(jabatan) + '</div>' +
        '</div>' +
        '<div style="text-align:center;flex-shrink:0;margin-right:8px">' +
          '<div style="font-size:18px;font-weight:800;color:var(--red)">' + reports.length + '</div>' +
          '<div style="font-size:9px;color:var(--text3);font-weight:600">LAPORAN</div>' +
        '</div>' +
        '<div style="color:var(--text3);font-size:12px;transition:transform .2s" id="chevron_' + groupId + '">&#9660;</div>' +
      '</div>' +
      '<div id="' + groupId + '" style="border-bottom:1px solid var(--border)">';

    // Reports under this user
    reports.forEach(function(item) {
      var r = item.data;
      var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : r.status === 'revisi' ? 'revisi' : 'pending';
      var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';
      var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : r.status === 'revisi' ? 'var(--blue-bg)' : 'var(--orange-bg)';
      var isChecked = selectedReportIds.has(item.id);

      var quickBtns = '';
      if ((r.status === 'pending' || r.status === 'revisi') && isAdmin) {
        quickBtns = ' <button class="btn btn-green btn-sm" onclick="event.stopPropagation();quickApprove(\'' + item.id + '\')">\u2713</button> <button class="btn btn-sm" style="background:var(--blue);color:#fff" onclick="event.stopPropagation();quickRevise(\'' + item.id + '\')">\u21BB</button> <button class="btn btn-red btn-sm" onclick="event.stopPropagation();quickReject(\'' + item.id + '\')">\u2717</button>';
      }

      var checkbox = '';
      if (isAdmin) {
        checkbox = '<div style="display:flex;align-items:center;margin-right:8px" onclick="event.stopPropagation()">' +
          '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="toggleReportSelect(\'' + item.id + '\', this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--red)">' +
        '</div>';
      }

      h += '<div class="report-item" onclick="viewReport(\'' + item.id + '\')" style="display:flex;align-items:center;padding-left:56px">' +
        checkbox +
        '<div class="ri-icon" style="background:' + iconBg + ';width:36px;height:36px;font-size:15px">\uD83D\uDCC4</div>' +
        '<div class="ri-body" style="flex:1;min-width:0">' +
          '<div class="ri-title">' + esc(r.judul) + '</div>' +
          '<div class="ri-sub">' + formatDate(r.tanggal) + ' &middot; ' + esc(r.type || 'Harian') + '</div>' +
          '<div class="ri-meta">' +
            '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
            quickBtns +
          '</div>' +
        '</div>' +
      '</div>';
    });

    h += '</div></div>';
  });

  container.innerHTML = h;
}

// Toggle expand/collapse user report group
function toggleUserGroup(groupId) {
  var el = document.getElementById(groupId);
  var chevron = document.getElementById('chevron_' + groupId);
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (chevron) chevron.innerHTML = '&#9660;';
  } else {
    el.style.display = 'none';
    if (chevron) chevron.innerHTML = '&#9654;';
  }
}

// Clear all report selections
function clearAllReportSelections() {
  selectedReportIds.clear();
  renderAdminReportList();
}

function renderAdminUserList() {
  var container = document.getElementById('adminUserList');
  if (!container) return;

  if (!cachedAdminUsers.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDC65</div><h4>Belum ada Tenaga Ahli</h4></div>';
    return;
  }

  // Count reports per user from cached admin reports (real-time)
  var reportCounts = {};
  cachedAdminReports.forEach(function(r) {
    var uid = r.data.userId;
    if (uid) reportCounts[uid] = (reportCounts[uid] || 0) + 1;
  });

  var h = '';
  cachedAdminUsers.forEach(function(item) {
    var u = item.data;
    var statusClass = u.status === 'active' ? 'active' : u.status === 'rejected' ? 'rejected' : 'pending';
    var statusText = u.status === 'active' ? 'Aktif' : u.status === 'rejected' ? 'Ditolak' : 'Menunggu';

    // Profile photo or initial avatar
    var avatarHtml = '';
    if (u.photo) {
      avatarHtml = '<div style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;margin-right:12px;background:var(--bg)"><img src="' + u.photo + '" style="width:100%;height:100%;object-fit:cover"></div>';
    } else {
      var initial = (u.nama || u.email || 'T').charAt(0).toUpperCase();
      avatarHtml = '<div style="width:44px;height:44px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0;margin-right:12px">' + initial + '</div>';
    }

    // Total reports for this user
    var totalReports = reportCounts[item.id] || 0;

    var actions = '<span class="status status-' + statusClass + '">' + statusText + '</span>';
    if (u.status === 'pending') {
      actions += ' <button class="btn btn-green btn-sm" onclick="approveUser(\'' + item.id + '\')">\u2713</button>' +
                 ' <button class="btn btn-red btn-sm" onclick="rejectUser(\'' + item.id + '\')">\u2717</button>';
    }
    // Delete button for all users
    actions += ' <button class="btn btn-ghost btn-sm" onclick="deleteUser(\'' + item.id + '\')" title="Hapus user" style="color:var(--text3);font-size:16px;margin-left:4px">\uD83D\uDDD1</button>';

    h += '<div class="pend-user" style="align-items:center">' +
      avatarHtml +
      '<div class="pu-info" style="flex:1;min-width:0">' +
        '<div class="pu-name">' + esc(u.nama || '-') + '</div>' +
        '<div class="pu-email">' + esc(u.jabatan || '-') + ' &middot; ' + esc(u.email) + '</div>' +
      '</div>' +
      '<div style="text-align:center;margin-right:12px;flex-shrink:0">' +
        '<div style="font-size:18px;font-weight:800;color:var(--text)">' + totalReports + '</div>' +
        '<div style="font-size:10px;color:var(--text3);font-weight:500">Laporan</div>' +
      '</div>' +
      '<div class="pu-actions">' + actions + '</div>' +
    '</div>';
  });
  container.innerHTML = h;
}

// --- Fallback: load admin data once ---
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
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function deleteUser(uid) {
  // Get user name for confirmation
  var userName = 'User';
  try {
    var uDoc = await db.collection('users').doc(uid).get();
    if (uDoc.exists) userName = uDoc.data().nama || uDoc.data().email || 'User';
  } catch(e) {}

  if (!confirm('Hapus user "' + userName + '"?\n\nSemua laporan user ini juga akan dihapus. Tindakan ini tidak dapat dibatalkan.')) return;

  showLoading();
  try {
    // 1. Delete all reports by this user
    var repSnap = await db.collection('laporan').where('userId', '==', uid).get();
    if (repSnap.size > 0) {
      var batch = db.batch();
      repSnap.forEach(function(doc) { batch.delete(doc.ref); });
      await batch.commit();
    }

    // 2. Delete all notifications for this user
    var notifSnap = await db.collection('notifikasi').where('target', '==', uid).limit(100).get();
    if (notifSnap.size > 0) {
      var batch2 = db.batch();
      notifSnap.forEach(function(doc) { batch2.delete(doc.ref); });
      await batch2.commit();
    }

    // 3. Delete user document from Firestore
    await db.collection('users').doc(uid).delete();

    hideLoading();
    showToast('User "' + userName + '" berhasil dihapus beserta ' + repSnap.size + ' laporan', 'success');
  } catch (e) {
    hideLoading();
    showToast('Gagal menghapus: ' + e.message, 'error');
  }
}

// v6: Fallback - removed orderBy from compound query, sort client-side
async function loadAdminReports() {
  if (!currentUser) return;
  if (adminReportUnsub) { renderAdminReportList(); return; }
  var period = document.getElementById('aPeriod') ? document.getElementById('aPeriod').value : 'all';
  var container = document.getElementById('adminRepList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var snap = await db.collection('laporan').limit(200).get();

    var allReports = [];
    snap.forEach(function(d) { allReports.push({ id: d.id, data: normalizeReport(d.data()) }); });

    // Filter by period
    var filtered = filterByPeriod(allReports, period);
    // Sort client-side
    sortReportsByDate(filtered);

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDCCB</div><h4>Tidak ada laporan</h4></div>';
      return;
    }

    var h = '';
    filtered.forEach(function(item) {
      var r = item.data;
      var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : r.status === 'revisi' ? 'revisi' : 'pending';
      var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';
      var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : r.status === 'revisi' ? 'var(--blue-bg)' : 'var(--orange-bg)';

      h += '<div class="report-item" onclick="viewReport(\'' + item.id + '\')">' +
        '<div class="ri-icon" style="background:' + iconBg + '">\uD83D\uDCC4</div>' +
        '<div class="ri-body">' +
          '<div class="ri-title">' + esc(r.judul) + '</div>' +
          '<div class="ri-sub">' + esc(r.nama || '-') + ' &middot; ' + formatDate(r.tanggal) + '</div>' +
          '<div class="ri-meta">' +
            '<span class="status status-' + statusClass + '">' + statusText + '</span>' +
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

// v6: Fallback - removed orderBy from compound query
async function loadAdminUsers() {
  if (!currentUser) return;
  if (adminUserUnsub) { renderAdminUserList(); return; }
  var container = document.getElementById('adminUserList');
  if (!container) return;
  container.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';

  try {
    var snap = await db.collection('users').where('role', '==', 'ta').limit(200).get();
    if (!snap.size) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">\uD83D\uDC65</div><h4>Belum ada Tenaga Ahli</h4></div>';
      return;
    }

    var allUsers = [];
    snap.forEach(function(d) { allUsers.push({ id: d.id, data: d.data() }); });
    // Sort client-side
    allUsers.sort(function(a, b) {
      var ta = a.data.createdAt ? (a.data.createdAt.toDate ? a.data.createdAt.toDate() : new Date(a.data.createdAt)) : new Date(0);
      var tb = b.data.createdAt ? (b.data.createdAt.toDate ? b.data.createdAt.toDate() : new Date(b.data.createdAt)) : new Date(0);
      return tb - ta;
    });

    var h = '';
    allUsers.forEach(function(item) {
      var d = item;
      var u = d.data;
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
      judul: 'Laporan Diterima',
      pesan: 'Laporan "' + r.judul + '" telah diterima.' + (note ? ' Catatan: ' + note : ''),
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Laporan diterima', 'success');
    closeModal('reportModal');
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function reviseReport(id) {
  var note = document.getElementById('adminNote') ? document.getElementById('adminNote').value.trim() : '';
  if (!note) { note = prompt('Catatan revisi:'); }
  if (!note) return showToast('Masukkan catatan revisi', 'error');
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'revisi', catatanAdmin: note });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
    await db.collection('notifikasi').add({
      judul: 'Laporan Perlu Revisi',
      pesan: 'Laporan "' + r.judul + '" perlu direvisi. Catatan: ' + note,
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Laporan dikembalikan untuk revisi', 'success');
    closeModal('reportModal');
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
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickApprove(id) {
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'approved' });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
    await db.collection('notifikasi').add({
      judul: 'Laporan Diterima',
      pesan: 'Laporan "' + r.judul + '" telah diterima.',
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Diterima', 'success');
  } catch (e) { hideLoading(); showToast('Gagal: ' + e.message, 'error'); }
}

async function quickRevise(id) {
  var note = prompt('Catatan revisi:');
  if (!note) return;
  showLoading();
  try {
    await db.collection('laporan').doc(id).update({ status: 'revisi', catatanAdmin: note });
    var doc = await db.collection('laporan').doc(id).get();
    var r = doc.data();
    await db.collection('notifikasi').add({
      judul: 'Laporan Perlu Revisi',
      pesan: 'Laporan "' + r.judul + '" perlu direvisi. Catatan: ' + note,
      target: r.userId,
      userId: currentUser.uid,
      isRead: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    hideLoading();
    showToast('Dikembalikan untuk revisi', 'success');
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

// ============================================================
// WORD EXPORT MODULE (v6)
// ============================================================

// ============================================================
// ADMIN LAPORAN: SUB-TAB HARIAN & BULANAN
// ============================================================
var currentSubTab = 'harian';
var pendingWordHTML = null;
var pendingWordFilename = null;

function switchSubTab(tab) {
  currentSubTab = tab;
  document.querySelectorAll('.sub-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.subtab === tab); });
  document.getElementById('subtab_harian').style.display = tab === 'harian' ? 'block' : 'none';
  document.getElementById('subtab_bulanan').style.display = tab === 'bulanan' ? 'block' : 'none';
  if (tab === 'harian') { setDateToday(); renderDailyReports(); }
  else { setMonthThis(); renderMonthlyReports(); }
}

function setDateToday() {
  var el = document.getElementById('dailyDate');
  if (el) { var n = new Date(); el.value = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
}

function setMonthThis() {
  var el = document.getElementById('monthlyMonth');
  if (el) { var n = new Date(); el.value = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); }
}

// --- Filter reports by specific date string (YYYY-MM-DD) ---
function filterReportsByDate(dateStr) {
  if (!dateStr) return [];
  return cachedAdminReports.filter(function(item) {
    var tanggal = item.data.tanggal;
    if (!tanggal) return false;
    if (typeof tanggal === 'string') return tanggal === dateStr;
    if (tanggal.toDate) {
      var d = tanggal.toDate();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') === dateStr;
    }
    return false;
  });
}

// --- Filter reports by month (YYYY-MM) ---
function filterReportsByMonth(monthStr) {
  if (!monthStr) return [];
  return cachedAdminReports.filter(function(item) {
    var tanggal = item.data.tanggal;
    if (!tanggal) return false;
    var dStr = '';
    if (typeof tanggal === 'string') dStr = tanggal.substring(0, 7);
    else if (tanggal.toDate) { var d = tanggal.toDate(); dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    return dStr === monthStr;
  });
}

// --- Render Daily Reports (grouped by user) ---
function renderDailyReports() {
  var dateStr = document.getElementById('dailyDate').value;
  var container = document.getElementById('dailyRepList');
  var titleEl = document.getElementById('dailyTitle');
  if (!container) return;

  if (!dateStr) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><h4>Pilih tanggal</h4></div>'; return; }

  var filtered = filterReportsByDate(dateStr);
  var dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (titleEl) titleEl.textContent = 'Laporan Harian';

  if (!filtered.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>Tidak ada laporan</h4><p>' + esc(dateLabel) + '</p></div>'; return; }

  container.innerHTML = '<div style="padding:10px 16px;background:var(--red-light);border-bottom:1px solid var(--border);font-size:12px;color:var(--red-dark);font-weight:600">' + filtered.length + ' laporan &middot; ' + esc(dateLabel) + '</div>' + buildGroupedReportHTML(filtered);
}

// --- Render Monthly Reports (grouped by user, then by date) ---
function renderMonthlyReports() {
  var monthStr = document.getElementById('monthlyMonth').value;
  var container = document.getElementById('monthlyRepList');
  var titleEl = document.getElementById('monthlyTitle');
  if (!container) return;

  if (!monthStr) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📆</div><h4>Pilih bulan</h4></div>'; return; }

  var filtered = filterReportsByMonth(monthStr);
  var [y, m] = monthStr.split('-');
  var monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var monthLabel = monthNames[parseInt(m) - 1] + ' ' + y;
  if (titleEl) titleEl.textContent = 'Laporan Bulanan';

  if (!filtered.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h4>Tidak ada laporan</h4><p>' + esc(monthLabel) + '</p></div>'; return; }

  container.innerHTML = '<div style="padding:10px 16px;background:var(--red-light);border-bottom:1px solid var(--border);font-size:12px;color:var(--red-dark);font-weight:600">' + filtered.length + ' laporan &middot; ' + esc(monthLabel) + '</div>' + buildGroupedReportHTML(filtered);
}

// --- Build grouped report HTML (by user) for daily/monthly ---
function buildGroupedReportHTML(filtered) {
  var isAdmin = currentUser && currentUser.role === 'admin';
  var userInfo = {};
  cachedAdminUsers.forEach(function(u) { userInfo[u.id] = u.data; });

  // Group by userId
  var grouped = {};
  filtered.forEach(function(item) {
    var uid = item.data.userId || 'unknown';
    if (!grouped[uid]) grouped[uid] = [];
    grouped[uid].push(item);
  });

  var userIds = Object.keys(grouped).sort(function(a, b) { return grouped[b].length - grouped[a].length; });
  var h = '';

  userIds.forEach(function(uid) {
    var reports = grouped[uid];
    var u = userInfo[uid] || {};
    var nama = u.nama || reports[0].data.nama || 'Unknown';
    var jabatan = u.jabatan || '-';
    var userPhoto = u.photo || '';

    var avatarHtml = '';
    if (userPhoto) {
      avatarHtml = '<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;margin-right:10px"><img src="' + userPhoto + '" style="width:100%;height:100%;object-fit:cover"></div>';
    } else {
      avatarHtml = '<div style="width:36px;height:36px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;margin-right:10px">' + nama.charAt(0).toUpperCase() + '</div>';
    }

    var groupId = 'ug_' + uid.replace(/[^a-zA-Z0-9]/g, '');
    h += '<div style="margin-bottom:2px">' +
      '<div class="report-item" style="background:var(--bg);cursor:pointer;border-bottom:1px solid var(--border);border-top:2px solid var(--red)" onclick="toggleUserGroup(\'' + groupId + '\')">' +
        avatarHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700">' + esc(nama) + '</div>' +
          '<div style="font-size:11px;color:var(--text2)">' + esc(jabatan) + '</div>' +
        '</div>' +
        '<div style="text-align:center;flex-shrink:0;margin-right:8px">' +
          '<div style="font-size:18px;font-weight:800;color:var(--red)">' + reports.length + '</div>' +
          '<div style="font-size:9px;color:var(--text3);font-weight:600">LAPORAN</div>' +
        '</div>' +
        '<div style="color:var(--text3);font-size:12px" id="chevron_' + groupId + '">&#9660;</div>' +
      '</div>' +
      '<div id="' + groupId + '" style="border-bottom:1px solid var(--border)">';

    reports.forEach(function(item) {
      var r = item.data;
      var statusClass = r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : r.status === 'revisi' ? 'revisi' : 'pending';
      var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';
      var iconBg = r.status === 'approved' ? 'var(--green-bg)' : r.status === 'rejected' ? 'var(--red-light)' : r.status === 'revisi' ? 'var(--blue-bg)' : 'var(--orange-bg)';

      var quickBtns = '';
      if ((r.status === 'pending' || r.status === 'revisi') && isAdmin) {
        quickBtns = ' <button class="btn btn-green btn-sm" onclick="event.stopPropagation();quickApprove(\'' + item.id + '\')">\u2713</button> <button class="btn btn-sm" style="background:var(--blue);color:#fff" onclick="event.stopPropagation();quickRevise(\'' + item.id + '\')">\u21BB</button> <button class="btn btn-red btn-sm" onclick="event.stopPropagation();quickReject(\'' + item.id + '\')">\u2717</button>';
      }

      h += '<div class="report-item" onclick="viewReport(\'' + item.id + '\')" style="display:flex;align-items:center;padding-left:56px">' +
        '<div class="ri-icon" style="background:' + iconBg + ';width:36px;height:36px;font-size:15px">\uD83D\uDCC4</div>' +
        '<div class="ri-body" style="flex:1;min-width:0">' +
          '<div class="ri-title">' + esc(r.judul) + '</div>' +
          '<div class="ri-sub">' + formatDate(r.tanggal) + ' &middot; ' + esc(r.type || 'Harian') + '</div>' +
          '<div class="ri-meta"><span class="status status-' + statusClass + '">' + statusText + '</span>' + quickBtns + '</div>' +
        '</div>' +
      '</div>';
    });

    h += '</div></div>';
  });
  return h;
}

// ============================================================
// PRINT / CETAK: Preview + Word Export
// ============================================================

// --- Print Daily Reports ---
async function printDailyReports() {
  var dateStr = document.getElementById('dailyDate').value;
  if (!dateStr) return showToast('Pilih tanggal terlebih dahulu', 'warning');
  var filtered = filterReportsByDate(dateStr);
  if (!filtered.length) return showToast('Tidak ada laporan untuk tanggal ini', 'warning');
  var dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  var title = 'Laporan Harian - ' + dateLabel;
  var filename = 'Laporan_Harian_' + dateStr.replace(/-/g, '') + '.doc';
  await showPrintPreview(filtered, title, filename);
}

// --- Print Monthly Reports ---
async function printMonthlyReports() {
  var monthStr = document.getElementById('monthlyMonth').value;
  if (!monthStr) return showToast('Pilih bulan terlebih dahulu', 'warning');
  var filtered = filterReportsByMonth(monthStr);
  if (!filtered.length) return showToast('Tidak ada laporan untuk bulan ini', 'warning');
  var [y, m] = monthStr.split('-');
  var monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var title = 'Laporan Bulanan - ' + monthNames[parseInt(m) - 1] + ' ' + y;
  var filename = 'Laporan_Bulanan_' + monthStr.replace(/-/g, '') + '.doc';
  await showPrintPreview(filtered, title, filename);
}

// --- Print Single Report (from detail modal) ---
async function printSingleReport(id) {
  showLoading();
  try {
    var doc = await db.collection('laporan').doc(id).get();
    if (!doc.exists) { hideLoading(); showToast('Laporan tidak ditemukan', 'error'); return; }
    var r = normalizeReport(doc.data());
    var reportData = [{ id: doc.id, data: r }];
    var title = 'Laporan - ' + (r.judul || 'Tanpa Judul');
    var filename = 'Laporan_' + (r.judul || 'report').replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_').substring(0, 30) + '.doc';
    await showPrintPreview(reportData, title, filename);
    hideLoading();
  } catch (e) {
    hideLoading();
    showToast('Gagal: ' + e.message, 'error');
  }
}

// --- Show Preview Modal ---
async function showPrintPreview(reports, title, filename) {
  showLoading();
  openModal('printPreviewModal');

  var infoEl = document.getElementById('previewInfo');
  var bodyEl = document.getElementById('printPreviewBody');
  if (infoEl) infoEl.textContent = reports.length + ' laporan';
  if (bodyEl) bodyEl.innerHTML = '<div class="spinner-center"><div class="spinner"></div><p style="margin-top:12px;font-size:12px;color:var(--text2)">Mengunduh foto dan menyiapkan preview...</p></div>';

  try {
    // Count total photos for progress feedback
    var totalPhotos = 0;
    reports.forEach(function(item) {
      var r = item.data || item;
      var fotoList = (r.fotoUrl && Array.isArray(r.fotoUrl)) ? r.fotoUrl : [];
      totalPhotos += fotoList.length;
    });

    var html = await generateWordHTML(reports, title);
    pendingWordHTML = html;
    pendingWordFilename = filename;

    // Extract body content for preview (strip Word XML wrapper)
    var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    var previewContent = bodyMatch ? bodyMatch[1] : html;

    if (bodyEl) bodyEl.innerHTML = '<div style="background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.6">' + previewContent + '</div>';
    if (infoEl) infoEl.textContent = reports.length + ' laporan' + (totalPhotos > 0 ? ' &middot; ' + totalPhotos + ' foto ter-embed' : '');
    hideLoading();
  } catch (e) {
    hideLoading();
    if (bodyEl) bodyEl.innerHTML = '<p style="text-align:center;color:var(--red)">Gagal memuat preview: ' + esc(e.message) + '</p>';
  }
}

// --- Confirm Download Word after preview ---
function confirmDownloadWord() {
  if (!pendingWordHTML) return showToast('Tidak ada dokumen untuk diunduh', 'warning');
  downloadWordDoc(pendingWordHTML, pendingWordFilename);
  showToast('Dokumen berhasil diunduh', 'success');
  closeModal('printPreviewModal');
  pendingWordHTML = null;
  pendingWordFilename = null;
}

// --- Generate Word-compatible HTML from reports ---
// Each report gets its own page (page-break-before: always)
// Photos are converted to base64 and embedded directly in the Word doc
async function generateWordHTML(reports, title) {
  var reportsWithImages = [];
  for (var i = 0; i < reports.length; i++) {
    var item = reports[i];
    var r = item.data || item;
    var fotoList = (r.fotoUrl && Array.isArray(r.fotoUrl)) ? r.fotoUrl : [];
    var base64Images = [];

    for (var j = 0; j < fotoList.length; j++) {
      try {
        base64Images.push(await urlToBase64(fotoList[j]));
      } catch (e) {
        base64Images.push(fotoList[j]);
      }
    }

    reportsWithImages.push({ data: r, images: base64Images });
  }

  // Sort by date ascending
  reportsWithImages.sort(function(a, b) {
    var ta = a.data.tanggal ? (a.data.tanggal.toDate ? a.data.tanggal.toDate() : new Date(a.data.tanggal)) : new Date(0);
    var tb = b.data.tanggal ? (b.data.tanggal.toDate ? b.data.tanggal.toDate() : new Date(b.data.tanggal)) : new Date(0);
    return ta - tb;
  });

  var now = new Date();
  var timestamp = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  var html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
    'xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8">' +
    '<style>' +
      'body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 2cm; line-height: 1.6; }' +
      '.cover { text-align: center; border-bottom: 3px double #c4161c; padding-bottom: 20px; margin-bottom: 30px; page-break-after: always; }' +
      '.cover h1 { font-size: 18pt; color: #c4161c; margin: 0 0 8px; font-weight: 700; letter-spacing: 1px; }' +
      '.cover h2 { font-size: 13pt; color: #444; margin: 0 0 4px; font-weight: 400; }' +
      '.cover .org { font-size: 11pt; color: #888; margin-top: 16px; }' +
      '.cover .title-doc { font-size: 14pt; color: #1a1a1a; margin-top: 24px; font-weight: 700; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 12px 0; }' +
      '.cover .timestamp { font-size: 9pt; color: #aaa; margin-top: 20px; }' +
      '.report { margin-bottom: 20px; }' +
      '.report-header { background: #f8f8f8; padding: 14px 16px; border-left: 4px solid #c4161c; margin-bottom: 16px; }' +
      '.report-header h3 { font-size: 14pt; margin: 0 0 6px; color: #1a1a1a; }' +
      '.report-meta { font-size: 9pt; color: #888; margin: 0; }' +
      '.field { margin-bottom: 10px; }' +
      '.field label { font-size: 9pt; font-weight: 700; color: #888; text-transform: uppercase; display: block; margin-bottom: 2px; letter-spacing: 0.5px; }' +
      '.field p { margin: 0; font-size: 11pt; }' +
      '.isi { background: #f9f9f9; padding: 14px 16px; border-radius: 4px; font-size: 11pt; line-height: 1.8; white-space: pre-wrap; margin: 8px 0; border: 1px solid #eee; }' +
      '.catatan { background: #fff7ed; padding: 12px 16px; border-left: 3px solid #ea580c; font-size: 10pt; color: #ea580c; margin: 8px 0; }' +
      '.status-approved { color: #16a34a; font-weight: 700; }' +
      '.status-pending { color: #ea580c; font-weight: 700; }' +
      '.status-rejected { color: #c4161c; font-weight: 700; }' +
      '.status-revisi { color: #2563eb; font-weight: 700; }' +
      '.photos { margin: 14px 0; }' +
      '.photos-title { font-size: 9pt; font-weight: 700; color: #888; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }' +
      '.photos img { max-width: 450px; max-height: 340px; margin: 6px 10px 6px 0; border: 1px solid #e0e0e0; border-radius: 4px; display: inline; }' +
      '.page-num { text-align: center; font-size: 9pt; color: #ccc; margin-top: 40px; }' +
      '.footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e8e8e8; text-align: center; font-size: 8pt; color: #bbb; }' +
      '@page { margin: 2cm; size: A4; }' +
    '</style>' +
    '</head><body>' +

    // Cover page
    '<div class="cover">' +
      '<h1>LAPORAN TENAGA AHLI</h1>' +
      '<h2>Fraksi PDI Perjuangan</h2>' +
      '<div class="org">Kabupaten Kepulauan Meranti</div>' +
      '<div class="title-doc">' + esc(title) + '</div>' +
      '<div class="timestamp">' + reportsWithImages.length + ' laporan &middot; Dicetak: ' + timestamp + '</div>' +
    '</div>';

  // Each report on a new page - use explicit page break for Word compatibility
  for (var k = 0; k < reportsWithImages.length; k++) {
    var item = reportsWithImages[k];
    var r = item.data;
    var imgs = item.images;

    var reportType = r.type || 'Harian';
    var statusClass = r.status === 'approved' ? 'status-approved' : r.status === 'rejected' ? 'status-rejected' : r.status === 'revisi' ? 'status-revisi' : 'status-pending';
    var statusText = r.status === 'approved' ? 'Diterima' : r.status === 'rejected' ? 'Ditolak' : r.status === 'revisi' ? 'Revisi' : 'Menunggu';

    // Insert explicit page break before each report (except the first one)
    if (k > 0) {
      html += '<br clear="all" style="page-break-before:always;mso-break-type:section-break">';
    }

    html += '<div class="report">' +
      '<div class="report-header">' +
        '<h3>' + esc(r.judul || 'Tanpa Judul') + '</h3>' +
        '<p class="report-meta">' + esc(r.nama || '-') + ' &middot; ' + formatDate(r.tanggal) + ' &middot; ' + esc(reportType) + ' &middot; <span class="' + statusClass + '">' + statusText + '</span></p>' +
      '</div>' +

      '<div class="field"><label>Tenaga Ahli</label><p><b>' + esc(r.nama || '-') + '</b></p></div>' +
      '<div class="field"><label>Tanggal Kegiatan</label><p>' + formatDate(r.tanggal) + '</p></div>' +
      '<div class="field"><label>Tipe Laporan</label><p>' + esc(reportType) + '</p></div>' +
      '<div class="field"><label>Status</label><p><span class="' + statusClass + '">' + statusText + '</span></p></div>' +
      '<div class="field"><label>Isi Laporan</label></div>' +
      '<div class="isi">' + esc(r.isi || '-') + '</div>';

    if (r.catatanAdmin) {
      html += '<div class="field"><label>Catatan Admin</label></div>' +
        '<div class="catatan">' + esc(r.catatanAdmin) + '</div>';
    }

    if (imgs.length > 0) {
      html += '<div class="photos"><div class="photos-title">Foto Kegiatan (' + imgs.length + ')</div>';
      for (var p = 0; p < imgs.length; p++) {
        html += '<img src="' + imgs[p] + '">';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  html += '<div class="footer">Dokumen ini dicetak otomatis dari Sistem Laporan Tenaga Ahli<br>Fraksi PDI Perjuangan Kab. Kepulauan Meranti</div>';
  html += '</body></html>';
  return html;
}

// --- Convert image URL to base64 for Word embedding ---
// Uses fetch() for reliable CORS download (more reliable than Image+Canvas)
function urlToBase64(url) {
  if (!url) return Promise.resolve('');
  if (url.indexOf('data:') === 0) return Promise.resolve(url);
  if (url.indexOf('http') !== 0) return Promise.resolve(url);

  return fetch(url, { mode: 'cors', cache: 'force-cache' })
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.blob();
    })
    .then(function(blob) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function() { resolve(reader.result); };
        reader.onerror = function() { reject(new Error('FileReader error')); };
        reader.readAsDataURL(blob);
      });
    })
    .catch(function(err) {
      // Fallback: try Image + Canvas approach
      console.warn('fetch base64 failed for', url, err.message, '- trying canvas fallback');
      return new Promise(function(resolve) {
        var img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch (e) {
            console.error('Canvas fallback also failed for', url);
            resolve(url);
          }
        };
        img.onerror = function() {
          console.error('Image fallback also failed for', url);
          resolve(url);
        };
        setTimeout(function() { resolve(url); }, 15000);
        img.src = url;
      });
    });
}

// --- Download Word document ---
function downloadWordDoc(html, filename) {
  var blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
