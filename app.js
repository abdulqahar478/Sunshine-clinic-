/**
 * AQ MedTech Innovations — Clinic EMR + Public Website
 * app.js — Complete Application Logic Brain
 * Version: 1.0.0
 * © 2024 AQ MedTech Innovations (Nigeria)
 */

'use strict';

// ===========================================================================
// === SECTION 1: INITIALIZATION & CONSTANTS =================================
// ===========================================================================

/** @type {import('@supabase/supabase-js').SupabaseClient} */
let supabaseClient = null;

/** @type {Dexie} */
let db = null;

/** Application state */
const state = {
  currentUser: null,
  currentRole: null,
  currentClinicId: null,
  isOnline: navigator.onLine,
  lastSyncTime: null,
};

/** Debounce utility */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Format date to YYYYMMDD */
function formatDateYMD(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dy}`;
}

/** Generate a UUID v4 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Initialize Supabase Client */
function initSupabase() {
  const cfg = window.CLINIC_CONFIG.supabase;
  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
}

/** Initialize Dexie.js local database */
function initDexie() {
  db = new Dexie('aq_clinic_local_db');
  db.version(1).stores({
    patients:
      '++localId, clinic_id, phone, full_name, synced, updated_at',
    appointments:
      '++localId, clinic_id, phone, queue_token, status, synced, created_at',
    consultations:
      '++localId, clinic_id, patient_id, status, synced, updated_at',
    payments:
      '++localId, clinic_id, consultation_id, is_locked, synced, payment_date',
    sync_queue:
      '++id, table_name, record_id, operation, synced_at',
    sessions:
      'id, user_id, role, clinic_id, expires_at',
  });

  // Seed sample demo data on first local run
  db.on('ready', async () => {
    try {
      const count = await db.patients.count();
      if (count === 0) {
        const p1 = await db.patients.add({
          clinic_id: 'clinic_001',
          full_name: 'Mrs. Chioma Adeleke',
          phone: '08023456789',
          dob: '1988-06-14',
          gender: 'female',
          address: '12 Admiralty Way, Lekki',
          blood_group: 'O+',
          genotype: 'AA',
          allergies: 'Penicillin',
          is_chronic: 1,
          last_refill_date: '2024-03-01',
          synced: 0,
          updated_at: new Date().toISOString()
        });
        await db.patients.add({
          clinic_id: 'clinic_001',
          full_name: 'Alhaji Musa Danjuma',
          phone: '08098765432',
          dob: '1965-11-20',
          gender: 'male',
          address: '5 Awolowo Road, Ikoyi',
          blood_group: 'A+',
          genotype: 'AS',
          allergies: 'None',
          is_chronic: 1,
          last_refill_date: '2024-02-15',
          synced: 0,
          updated_at: new Date().toISOString()
        });
        await db.consultations.add({
          clinic_id: 'clinic_001',
          patient_id: p1,
          queue_token: 'TKN-001',
          status: 'with_doctor',
          bp_systolic: 145,
          bp_diastolic: 95,
          temperature: 38.2,
          weight_kg: 74,
          pulse_bpm: 88,
          symptoms: 'High fever, persistent headache and body chills since yesterday.',
          triage_notes: 'Triage complete. Elevated BP noted. Patient in Doctor queue.',
          synced: 0,
          updated_at: new Date().toISOString()
        });
        await db.appointments.add({
          clinic_id: 'clinic_001',
          full_name: 'Mr. Emeka Eze',
          phone: '08055554433',
          department: 'Outpatient Care',
          appointment_date: new Date().toISOString().split('T')[0],
          symptoms: 'Routine medical checkup and BP review',
          queue_token: 'TKN-002',
          status: 'pending',
          synced: 0,
          created_at: new Date().toISOString()
        });
      }
    } catch (_) {}
  });
}

/** Apply CLINIC_CONFIG brand colors to CSS custom properties */
function applyBrandColors() {
  const cfg = window.CLINIC_CONFIG;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', cfg.primaryColor || '#1a6b3c');
  root.style.setProperty('--color-secondary', cfg.secondaryColor || '#f59e0b');
  root.style.setProperty('--color-accent', cfg.accentColor || '#0ea5e9');
}

// ===========================================================================
// === SECTION 2: ROUTING ENGINE =============================================
// ===========================================================================

/** Zone IDs used in routing */
const ZONES = {
  public: 'zone-public',
  auth: 'zone-auth',
  emr: 'zone-emr',
};

/** Hide all zones and show the given one */
function showZone(zoneName) {
  Object.values(ZONES).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
    }
  });
  const targetId = ZONES[zoneName] || zoneName;
  const target = document.getElementById(targetId);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
  }
}

/** Navigate to #Admin hash */
function navigateToAdmin() {
  window.location.hash = '#Admin';
}

/** Check session validity and route accordingly */
async function checkAuthAndRoute() {
  // Try localStorage session
  const lsSession = localStorage.getItem('aq_session');
  if (lsSession) {
    try {
      const session = JSON.parse(lsSession);
      const now = new Date();
      if (session && session.expires_at && new Date(session.expires_at) > now) {
        // Validate in Dexie sessions table as secondary check
        const dbSession = await db.sessions.get(session.id).catch(() => null);
        if (dbSession && new Date(dbSession.expires_at) > now) {
          state.currentUser = session.user;
          state.currentRole = session.role;
          state.currentClinicId = session.clinic_id;
          showZone('emr');
          routeByRole(session.role);
          return;
        }
      }
    } catch (e) {
      // corrupted session
    }
  }
  // No valid session — show auth
  showZone('auth');
  renderAuthScreen();
}

/** Hash-based router */
function Router() {
  const handleRoute = async () => {
    const rawHash = window.location.hash.replace('#', '');
    const hash = rawHash.toLowerCase();

    if (hash === 'admin') {
      // Record PWA admin mode
      localStorage.setItem('pwa_mode', 'admin');
      await checkAuthAndRoute();
    } else if (hash === 'portal') {
      showZone('public');
      const el = document.getElementById('patient-portal');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (hash === 'booking') {
      showZone('public');
      const el = document.getElementById('booking-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      showZone('public');
    }
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // Run on load
}

// ===========================================================================
// === SECTION 3: DYNAMIC PUBLIC WEBSITE RENDERING ===========================
// ===========================================================================

/** Determine if clinic is currently open based on CLINIC_CONFIG.openingHours */
function isClinicOpen() {
  const cfg = window.CLINIC_CONFIG;
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1-5=Mon-Fri, 6=Sat
  let hours;
  if (day >= 1 && day <= 5) hours = cfg.openingHours.weekdays;
  else if (day === 6) hours = cfg.openingHours.saturday;
  else hours = cfg.openingHours.sunday;

  if (!hours || hours.toLowerCase() === 'closed') return false;

  const match = hours.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return false;

  const parseHour = (h, m, ampm) => {
    let hour = parseInt(h, 10);
    const min = parseInt(m || '0', 10);
    if (ampm && ampm.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (ampm && ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    return hour * 60 + min;
  };

  const openMin = parseHour(match[1], match[2], match[3]);
  const closeMin = parseHour(match[4], match[5], match[6]);
  const currentMin = now.getHours() * 60 + now.getMinutes();
  return currentMin >= openMin && currentMin < closeMin;
}

/** Render hero section */
function renderHero() {
  const cfg = window.CLINIC_CONFIG;
  const nameEl = document.getElementById('hero-clinic-name');
  if (nameEl) nameEl.textContent = cfg.name;

  const navName = document.getElementById('nav-clinic-name');
  if (navName) navName.textContent = cfg.name;

  const taglineEl = document.getElementById('hero-tagline');
  if (taglineEl) taglineEl.textContent = cfg.tagline;

  const emergencyLink = document.getElementById('hero-emergency-phone') || document.getElementById('btn-emergency');
  if (emergencyLink) {
    emergencyLink.href = `tel:${cfg.emergencyPhone}`;
    if (!emergencyLink.querySelector('svg')) emergencyLink.textContent = `📞 Emergency: ${cfg.emergencyPhone}`;
  }

  const waLink = document.getElementById('hero-whatsapp-link') || document.getElementById('btn-whatsapp');
  if (waLink) {
    waLink.href = `https://wa.me/${cfg.whatsappNumber}?text=Hello%2C%20I%20need%20help%20from%20${encodeURIComponent(cfg.name)}`;
    waLink.target = '_blank';
    waLink.rel = 'noopener';
  }

  const badge = document.getElementById('clinic-open-badge') || document.getElementById('open-status-badge');
  if (badge) {
    const open = isClinicOpen();
    badge.textContent = open ? '● Open Now' : '● Closed';
    badge.className = open ? 'badge badge-open bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold' : 'badge badge-closed bg-gray-500 text-white px-3 py-1 rounded-full text-xs font-bold';
    badge.style.backgroundColor = open ? '#16a34a' : '#dc2626';
    badge.style.color = '#fff';
  }
}

/** Render services grid */
function renderServices() {
  const cfg = window.CLINIC_CONFIG;
  const grid = document.getElementById('services-grid');
  if (!grid || !cfg.services) return;
  grid.innerHTML = cfg.services
    .map(
      (s) => `
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 group">
      <div class="text-4xl mb-4">${s.icon}</div>
      <h3 class="text-lg font-bold text-gray-800 mb-2 group-hover:text-primary-600 transition-colors">${s.title}</h3>
      <p class="text-gray-500 text-sm leading-relaxed">${s.description}</p>
    </div>`
    )
    .join('');
}

/** Render doctors section */
function renderDoctors() {
  const cfg = window.CLINIC_CONFIG;
  const grid = document.getElementById('doctors-grid');
  if (!grid || !cfg.doctors) return;
  grid.innerHTML = cfg.doctors
    .map((d) => {
      const initials = d.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
      const avatarHtml = d.photoUrl
        ? `<img src="${d.photoUrl}" alt="${d.name}" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-4 border-primary-100">`
        : `<div class="w-24 h-24 rounded-full mx-auto mb-4 bg-primary-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-primary-100">${initials}</div>`;
      return `
      <div class="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 text-center border border-gray-100">
        ${avatarHtml}
        <h4 class="font-bold text-gray-800 text-base">${d.name}</h4>
        <p class="text-primary-600 text-sm font-semibold mt-1">${d.specialty}</p>
        <p class="text-gray-400 text-xs mt-1">${d.qualifications}</p>
        <div class="mt-3 text-xs bg-primary-50 text-primary-700 rounded-lg px-3 py-1.5 font-medium inline-block">📅 ${d.consultingDays}</div>
      </div>`;
    })
    .join('');
}

/** Render HMO badge list */
function renderHMOs() {
  const cfg = window.CLINIC_CONFIG;
  const container = document.getElementById('hmos-grid') || document.getElementById('hmo-list');
  if (!container || !cfg.hmos) return;
  container.innerHTML = cfg.hmos
    .map((h) => `<div class="bg-white bg-opacity-20 backdrop-blur-sm border border-white border-opacity-30 text-white font-semibold text-sm px-5 py-2.5 rounded-full shadow-sm">✓ ${h}</div>`)
    .join('');
}

/** Render directions section */
function renderDirections() {
  const cfg = window.CLINIC_CONFIG;
  const addrEl = document.getElementById('dir-address') || document.getElementById('clinic-address');
  if (addrEl) addrEl.innerHTML = `<strong>${cfg.name}</strong><br/>${cfg.address}<br/>${cfg.city}, ${cfg.state}`;

  const landmarksEl = document.getElementById('dir-landmarks') || document.getElementById('clinic-landmarks');
  if (landmarksEl && cfg.landmarks) {
    landmarksEl.innerHTML = cfg.landmarks
      .map((l) => `<li class="flex items-start gap-2 text-gray-600 text-sm"><span class="text-primary-500 mt-0.5">📍</span>${l}</li>`)
      .join('');
  }

  const mapLink = document.getElementById('dir-map-btn') || document.getElementById('clinic-map-link');
  if (mapLink) {
    mapLink.href = cfg.mapLink;
    mapLink.target = '_blank';
    mapLink.rel = 'noopener';
  }

  const hoursEl = document.getElementById('dir-hours');
  if (hoursEl && cfg.openingHours) {
    hoursEl.innerHTML = `
      <tr><td class="py-1.5 pr-4 text-sm font-medium text-gray-600">Mon – Fri</td><td class="py-1.5 text-sm text-gray-800 font-medium">${cfg.openingHours.weekdays}</td></tr>
      <tr><td class="py-1.5 pr-4 text-sm font-medium text-gray-600">Saturday</td><td class="py-1.5 text-sm text-gray-800 font-medium">${cfg.openingHours.saturday}</td></tr>
      <tr><td class="py-1.5 pr-4 text-sm font-medium text-gray-600">Sunday</td><td class="py-1.5 text-sm text-gray-800 font-medium">${cfg.openingHours.sunday}</td></tr>
    `;
  }
}

/** Render footer */
function renderFooter() {
  const cfg = window.CLINIC_CONFIG;
  const nameEl = document.getElementById('footer-clinic-name');
  if (nameEl) nameEl.textContent = cfg.name;

  const vendorEl = document.getElementById('footer-vendor');
  if (vendorEl) vendorEl.textContent = cfg.vendorName;

  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// ===========================================================================
// === SECTION 4: SECRET #ADMIN GATEWAY ======================================
// ===========================================================================

/** 5-tap footer shortcut to unlock admin */
function setupFooterTapShortcut() {
  const footerCopy = document.getElementById('footer-copyright');
  if (!footerCopy) return;
  let tapCount = 0;
  let tapTimer = null;

  footerCopy.addEventListener('click', () => {
    tapCount++;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 3000);
    }
    if (tapCount >= 5) {
      clearTimeout(tapTimer);
      tapCount = 0;
      window.location.hash = '#Admin';
    }
  });
}

/** PWA home screen memory on #Admin visit */
function checkPwaModeOnLoad() {
  const pwaMode = localStorage.getItem('pwa_mode');
  const lsSession = localStorage.getItem('aq_session');
  if (pwaMode === 'admin' && !lsSession) {
    showZone('auth');
    renderAuthScreen();
  }
}

/** iOS install banner detection */
function setupIOSBanner() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone) {
    const banner = document.getElementById('ios-install-banner');
    if (banner) banner.style.display = 'block';
  }
}

/** Android / Desktop PWA install prompt */
let _deferredInstallPrompt = null;

function setupAndroidInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    const btn = document.getElementById('android-install-btn');
    if (btn) {
      btn.style.display = 'inline-flex';
      btn.addEventListener('click', () => {
        if (_deferredInstallPrompt) {
          _deferredInstallPrompt.prompt();
          _deferredInstallPrompt.userChoice.then(() => {
            _deferredInstallPrompt = null;
            btn.style.display = 'none';
          });
        }
      });
    }
  });
}

// ===========================================================================
// === SECTION 5: AUTHENTICATION (Supabase Auth + Offline Session Cache) =====
// ===========================================================================

/** Render the auth screen (login form) */
function renderAuthScreen() {
  const authZone = document.getElementById('zone-auth');
  if (!authZone) return;

  // If index.html already has the styled Tailwind #auth-form, wire it up without replacing innerHTML!
  const existingAuthForm = document.getElementById('auth-form');
  if (existingAuthForm) {
    window.appHandleLogin = async (e) => {
      e.preventDefault();
      const email = (document.getElementById('auth-email') || document.getElementById('login-email')).value.trim();
      const password = (document.getElementById('auth-password') || document.getElementById('login-password')).value;
      const btn = document.getElementById('btn-auth-submit') || document.getElementById('login-btn');
      const errEl = document.getElementById('auth-error') || document.getElementById('login-error');
      const loading = document.getElementById('auth-loading');
      if (btn) btn.disabled = true;
      if (loading) loading.classList.remove('hidden');
      if (errEl) {
        errEl.classList.add('hidden');
        errEl.style.display = 'none';
      }
      try {
        await login(email, password);
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Login failed. Please check your credentials.';
          errEl.classList.remove('hidden');
          errEl.style.display = 'block';
        }
      } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.classList.add('hidden');
      }
    };
    return;
  }

  // Only inject fallback form if no form already present
  if (authZone.querySelector('#login-form')) return;

  authZone.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">🏥</div>
        <h2 class="auth-title">${window.CLINIC_CONFIG.name}</h2>
        <p class="auth-subtitle">Staff Login Portal</p>
        <form id="login-form" autocomplete="on">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input type="email" id="login-email" name="email" required placeholder="staff@clinic.com" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" name="password" required placeholder="••••••••" />
          </div>
          <div id="login-error" class="login-error" style="display:none;color:#dc2626;margin-bottom:0.5rem;"></div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn" style="background-color:#1a6b3c !important;color:#ffffff !important;padding:14px;border-radius:12px;font-weight:700;width:100%;border:none;cursor:pointer;display:block;">Sign In</button>
        </form>
        <p class="auth-footer">Powered by <strong>${window.CLINIC_CONFIG.vendorName}</strong></p>
      </div>
    </div>
    <div id="subscription-expired-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:none;align-items:center;justify-content:center;">
      <div style="background:#fff;padding:2rem;border-radius:1rem;max-width:400px;text-align:center;">
        <div style="font-size:3rem;">🔒</div>
        <h2>Subscription Expired</h2>
        <p>Your clinic subscription has expired. Please contact your software provider to renew.</p>
        <a href="https://wa.me/${window.CLINIC_CONFIG.vendorWhatsapp}?text=Hi%2C%20my%20clinic%20subscription%20has%20expired.%20Please%20help%20renew." 
           class="btn btn-primary" target="_blank">Contact ${window.CLINIC_CONFIG.vendorName}</a>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      errEl.style.display = 'none';
      try {
        await login(email, password);
      } catch (err) {
        errEl.textContent = err.message || 'Login failed. Please try again.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }
}

const DEMO_STAFF_ACCOUNTS = {
  'doctor@aqmedtech.com': {
    id: 'demo-doc-001',
    role: 'doctor',
    full_name: 'Dr. Adaeze Nwosu',
    clinic_id: 'clinic_001',
    pass: 'DoctorPass2025!'
  },
  'director@aqmedtech.com': {
    id: 'demo-dir-001',
    role: 'medical_director',
    full_name: 'Dr. Chukwuemeka Obi (MD)',
    clinic_id: 'clinic_001',
    pass: 'DirectorPass2025!'
  },
  'reception@aqmedtech.com': {
    id: 'demo-rec-001',
    role: 'receptionist',
    full_name: 'Nurse Blessing Okafor',
    clinic_id: 'clinic_001',
    pass: 'ReceptPass2025!'
  },
  'cashier@aqmedtech.com': {
    id: 'demo-csh-001',
    role: 'cashier',
    full_name: 'Mr. Tunde Adeleke',
    clinic_id: 'clinic_001',
    pass: 'CashPass2025!'
  },
  'admin@aqmedtech.com': {
    id: 'demo-adm-001',
    role: 'super_admin',
    full_name: 'AQ Platform SuperAdmin',
    clinic_id: 'clinic_001',
    pass: 'AdminPass2025!'
  },
  'doctor@sunriseclinic.ng': {
    id: 'demo-doc-002',
    role: 'doctor',
    full_name: 'Dr. Adaeze Nwosu',
    clinic_id: 'clinic_001',
    pass: 'DoctorPass2025!'
  },
  'director@sunriseclinic.ng': {
    id: 'demo-dir-002',
    role: 'medical_director',
    full_name: 'Dr. Chukwuemeka Obi (MD)',
    clinic_id: 'clinic_001',
    pass: 'DirectorPass2025!'
  },
  'reception@sunriseclinic.ng': {
    id: 'demo-rec-002',
    role: 'receptionist',
    full_name: 'Nurse Blessing Okafor',
    clinic_id: 'clinic_001',
    pass: 'ReceptPass2025!'
  },
  'cashier@sunriseclinic.ng': {
    id: 'demo-csh-002',
    role: 'cashier',
    full_name: 'Mr. Tunde Adeleke',
    clinic_id: 'clinic_001',
    pass: 'CashPass2025!'
  }
};

/** Fill demo account credentials into login form */
function fillDemoLogin(role) {
  const emailInput = document.getElementById('auth-email') || document.getElementById('login-email');
  const passInput = document.getElementById('auth-password') || document.getElementById('login-password');
  const errEl = document.getElementById('auth-error') || document.getElementById('login-error');
  if (errEl) {
    errEl.classList.add('hidden');
    errEl.style.display = 'none';
  }
  const accounts = {
    doctor: { email: 'doctor@aqmedtech.com', pass: 'DoctorPass2025!' },
    receptionist: { email: 'reception@aqmedtech.com', pass: 'ReceptPass2025!' },
    cashier: { email: 'cashier@aqmedtech.com', pass: 'CashPass2025!' },
    director: { email: 'director@aqmedtech.com', pass: 'DirectorPass2025!' }
  };
  const acc = accounts[role];
  if (acc && emailInput && passInput) {
    emailInput.value = acc.email;
    passInput.value = acc.pass;
  }
}
window.fillDemoLogin = fillDemoLogin;

/** Login function */
async function login(email, password) {
  const errEl = document.getElementById('auth-error') || document.getElementById('login-error');
  const showError = (msg) => {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      errEl.classList.remove('hidden');
    }
    throw new Error(msg);
  };

  const cleanEmail = (email || '').trim().toLowerCase();
  const demoAccount = DEMO_STAFF_ACCOUNTS[cleanEmail];
  const isSupabaseConfigured = window.CLINIC_CONFIG?.supabase?.url && 
    !window.CLINIC_CONFIG.supabase.url.includes('YOUR_PROJECT_ID');

  // 1. Direct Demo / Offline bypass for local evaluation or offline testing
  if (demoAccount) {
    if (password && password !== demoAccount.pass && isSupabaseConfigured) {
      showError(`Incorrect password. Demo password is: ${demoAccount.pass}`);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sessionObj = {
      id: demoAccount.id,
      user_id: demoAccount.id,
      user: { id: demoAccount.id, email: cleanEmail, full_name: demoAccount.full_name },
      role: demoAccount.role,
      clinic_id: demoAccount.clinic_id,
      expires_at: expiresAt,
    };

    localStorage.setItem('aq_session', JSON.stringify(sessionObj));
    await db.sessions.put(sessionObj);

    state.currentUser = sessionObj.user;
    state.currentRole = demoAccount.role;
    state.currentClinicId = demoAccount.clinic_id;

    showZone('emr');
    routeByRole(demoAccount.role);
    return;
  }

  // 2. If Supabase is unconfigured and not a recognized demo email
  if (!isSupabaseConfigured) {
    showError('Demo mode active: please sign in with doctor@aqmedtech.com, reception@aqmedtech.com, cashier@aqmedtech.com, or director@aqmedtech.com');
  }

  if (state.isOnline) {
    // Online path: Supabase Auth
    let authResult;
    try {
      authResult = await supabaseClient.auth.signInWithPassword({ email: cleanEmail, password });
    } catch (netErr) {
      // Fall through to offline path
      return await offlineLogin(cleanEmail, showError);
    }

    if (authResult.error) {
      // Try offline fallback
      return await offlineLogin(cleanEmail, showError);
    }

    const authUser = authResult.data.user;

    // Fetch staff_profile
    const { data: profile, error: profileErr } = await supabaseClient
      .from('staff_profiles')
      .select('*')
      .eq('user_id', authUser.id)
      .single();

    if (profileErr || !profile) {
      showError('Staff profile not found. Contact your administrator.');
    }

    // Check clinic is_active
    const { data: clinic } = await supabaseClient
      .from('clinics')
      .select('is_active')
      .eq('id', profile.clinic_id)
      .single();

    if (clinic && !clinic.is_active) {
      checkSubscriptionLock(false);
      showError('Clinic subscription expired.');
    }

    // Check locum expiry
    if (profile.role === 'locum_doctor') {
      if (profile.expires_at && new Date(profile.expires_at) < new Date()) {
        showError('Locum session expired. Please contact the Medical Director.');
      }
    }

    // Build session object
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h
    const sessionObj = {
      id: authUser.id,
      user_id: authUser.id,
      user: { id: authUser.id, email: authUser.email, full_name: profile.full_name },
      role: profile.role,
      clinic_id: profile.clinic_id,
      expires_at: expiresAt,
    };

    // Store session
    localStorage.setItem('aq_session', JSON.stringify(sessionObj));
    await db.sessions.put(sessionObj);

    // Update state
    state.currentUser = sessionObj.user;
    state.currentRole = profile.role;
    state.currentClinicId = profile.clinic_id;

    showZone('emr');
    routeByRole(profile.role);
    if (state.isOnline) syncToSupabase().catch(() => {});
  } else {
    await offlineLogin(cleanEmail, showError);
  }
}

/** Offline login fallback using Dexie sessions */
async function offlineLogin(email, showError) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const sessions = await db.sessions.toArray();
  const now = new Date();
  const valid = sessions.find(
    (s) => s.user && s.user.email && s.user.email.toLowerCase() === cleanEmail && new Date(s.expires_at) > now
  );
  if (valid) {
    state.currentUser = valid.user;
    state.currentRole = valid.role;
    state.currentClinicId = valid.clinic_id;

    showZone('emr');
    routeByRole(valid.role);
    return;
  }

  // Check demo accounts as offline fallback
  const demoAccount = DEMO_STAFF_ACCOUNTS[cleanEmail];
  if (demoAccount) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sessionObj = {
      id: demoAccount.id,
      user_id: demoAccount.id,
      user: { id: demoAccount.id, email: cleanEmail, full_name: demoAccount.full_name },
      role: demoAccount.role,
      clinic_id: demoAccount.clinic_id,
      expires_at: expiresAt,
    };
    await db.sessions.put(sessionObj);
    localStorage.setItem('aq_session', JSON.stringify(sessionObj));
    state.currentUser = sessionObj.user;
    state.currentRole = demoAccount.role;
    state.currentClinicId = demoAccount.clinic_id;
    showZone('emr');
    routeByRole(demoAccount.role);
    return;
  }

  showError('No offline session found for this user. Sign in with a demo account (e.g. doctor@aqmedtech.com / DoctorPass2025!)');
}

/** Logout */
async function logout() {
  try {
    if (state.isOnline) await supabaseClient.auth.signOut();
  } catch (_) {}
  localStorage.removeItem('aq_session');
  if (state.currentUser) {
    await db.sessions.delete(state.currentUser.id).catch(() => {});
  }
  state.currentUser = null;
  state.currentRole = null;
  state.currentClinicId = null;
  showZone('public');
  window.location.hash = '';
}

/** Show subscription expired overlay */
function checkSubscriptionLock(clinicIsActive) {
  if (!clinicIsActive) {
    const overlay = document.getElementById('subscription-expired-overlay');
    if (overlay) overlay.style.display = 'flex';
  }
}

/** Show/hide EMR tabs based on role */
function routeByRole(role) {
  const allTabs = ['tab-reception', 'tab-doctor', 'tab-cashier', 'tab-director', 'tab-superadmin'];
  allTabs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });

  const show = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      el.style.display = 'inline-block';
    }
  };

  const staffNameEl = document.getElementById('emr-staff-name');
  const roleBadgeEl = document.getElementById('emr-role-badge');
  if (staffNameEl && state.currentUser) {
    staffNameEl.textContent = state.currentUser.full_name || state.currentUser.email || 'Staff';
  }
  if (roleBadgeEl) {
    const roleLabels = {
      receptionist: 'Receptionist',
      nurse: 'Nurse',
      doctor: 'Doctor',
      locum_doctor: 'Locum Doctor (24h)',
      cashier: 'Cashier',
      medical_director: 'Medical Director',
      super_admin: 'Super Admin',
    };
    roleBadgeEl.textContent = roleLabels[role] || role;
  }

  window._locumSafeMode = (role === 'locum_doctor');
  const switchTabFn = typeof window.switchTab === 'function' ? window.switchTab : (t) => {
    const s = document.getElementById('screen-' + t);
    if (s) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      s.classList.add('active');
    }
  };

  switch (role) {
    case 'receptionist':
    case 'nurse':
      show('tab-reception');
      switchTabFn('reception');
      initReceptionScreen();
      break;
    case 'doctor':
      show('tab-doctor');
      switchTabFn('doctor');
      initDoctorScreen();
      break;
    case 'locum_doctor':
      show('tab-doctor');
      switchTabFn('doctor');
      initDoctorScreen();
      break;
    case 'cashier':
      show('tab-cashier');
      switchTabFn('cashier');
      initCashierScreen();
      break;
    case 'medical_director':
      allTabs.filter((t) => t !== 'tab-superadmin').forEach(show);
      switchTabFn('reception');
      initReceptionScreen();
      initDoctorScreen();
      initCashierScreen();
      initDirectorDashboard('today');
      break;
    case 'super_admin':
      allTabs.forEach(show);
      switchTabFn('reception');
      initReceptionScreen();
      initDoctorScreen();
      initCashierScreen();
      initDirectorDashboard('today');
      initSuperAdmin();
      break;
    default:
      showZone('auth');
  }
}

// ===========================================================================
// === SECTION 6: DEXIE.JS LOCAL DATABASE OPERATIONS =========================
// ===========================================================================

/** Add a record to the sync queue */
async function addToSyncQueue(tableName, recordId, operation) {
  await db.sync_queue.add({
    table_name: tableName,
    record_id: String(recordId),
    operation,
    synced_at: null,
  });
}

/** Save (upsert) patient to Dexie */
async function savePatient(patientData) {
  const now = new Date().toISOString();
  const record = {
    ...patientData,
    clinic_id: patientData.clinic_id || state.currentClinicId,
    synced: 0,
    updated_at: now,
  };
  let localId;
  if (record.localId) {
    await db.patients.put(record);
    localId = record.localId;
  } else {
    localId = await db.patients.add(record);
  }
  await addToSyncQueue('patients', localId, record.localId ? 'update' : 'insert');
  return localId;
}

/** Search patients by phone or full_name (case-insensitive, top 10) */
async function searchPatients(query) {
  if (!query || query.trim() === '') return [];
  const q = query.trim().toLowerCase();
  const all = await db.patients
    .filter((p) => {
      const nameMatch = p.full_name && p.full_name.toLowerCase().includes(q);
      const phoneMatch = p.phone && p.phone.toLowerCase().includes(q);
      return nameMatch || phoneMatch;
    })
    .limit(10)
    .toArray();
  return all;
}

/** Get patient by localId */
async function getPatientById(localId) {
  return db.patients.get(localId);
}

/** Save appointment from public booking form */
async function saveAppointment(apptData) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Count today's appointments for token generation
  const todayAppts = await db.appointments
    .filter((a) => a.created_at && a.created_at.startsWith(today))
    .count();

  const tokenNum = String(todayAppts + 1).padStart(3, '0');
  const queueToken = `TKN-${tokenNum}`;

  const record = {
    ...apptData,
    clinic_id: apptData.clinic_id || state.currentClinicId || window.CLINIC_CONFIG.clinicId,
    queue_token: apptData.queue_token || queueToken,
    status: apptData.status || 'pending',
    synced: 0,
    created_at: now.toISOString(),
  };

  const localId = await db.appointments.add(record);
  await addToSyncQueue('appointments', localId, 'insert');
  return { localId, queue_token: record.queue_token };
}

/** Get appointments with optional filters */
async function getAppointments(filters = {}) {
  let query = db.appointments;
  const all = await query.toArray();
  return all.filter((a) => {
    if (filters.status && a.status !== filters.status) return false;
    if (filters.clinic_id && a.clinic_id !== filters.clinic_id) return false;
    return true;
  });
}

/** Save consultation */
async function saveConsultation(consultData) {
  const now = new Date().toISOString();
  const record = {
    ...consultData,
    clinic_id: consultData.clinic_id || state.currentClinicId,
    synced: 0,
    updated_at: now,
  };
  let localId;
  if (record.localId) {
    await db.consultations.put(record);
    localId = record.localId;
  } else {
    localId = await db.consultations.add(record);
  }
  await addToSyncQueue('consultations', localId, record.localId ? 'update' : 'insert');
  return localId;
}

/** Update consultation status */
async function updateConsultationStatus(id, status) {
  await db.consultations.update(id, { status, updated_at: new Date().toISOString(), synced: 0 });
  await addToSyncQueue('consultations', id, 'update');
}

/** Get consultations for a patient */
async function getConsultationsForPatient(patientId) {
  return db.consultations.filter((c) => c.patient_id === patientId).toArray();
}

/** Save payment and immediately lock it */
async function savePayment(paymentData) {
  const now = new Date().toISOString();
  const record = {
    ...paymentData,
    clinic_id: paymentData.clinic_id || state.currentClinicId,
    is_locked: true,
    synced: 0,
    payment_date: paymentData.payment_date || now.split('T')[0],
    created_at: now,
  };
  const localId = await db.payments.add(record);
  await addToSyncQueue('payments', localId, 'insert');
  return localId;
}

/** Lock a payment record (irreversible) */
async function lockPayment(paymentId) {
  await db.payments.update(paymentId, { is_locked: true, synced: 0 });
}

/** Get payments by date range */
async function getPaymentsByDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return db.payments
    .filter((p) => {
      const d = new Date(p.payment_date);
      return d >= start && d <= end;
    })
    .toArray();
}

// ===========================================================================
// === SECTION 7: BACKGROUND SYNC ENGINE =====================================
// ===========================================================================

/** Update the sync status pill in the UI */
function updateSyncPill(status) {
  const pill = document.getElementById('sync-pill');
  if (!pill) return;
  const configs = {
    'online-synced': { text: '✓ Synced', bg: '#16a34a', color: '#fff' },
    syncing: { text: '↻ Syncing…', bg: '#d97706', color: '#fff' },
    offline: { text: '⚡ Offline', bg: '#dc2626', color: '#fff' },
  };
  const cfg = configs[status] || configs.offline;
  pill.textContent = cfg.text;
  pill.style.background = cfg.bg;
  pill.style.color = cfg.color;
}

/** Table map for Supabase sync */
const SYNC_TABLE_MAP = {
  patients: 'patients',
  appointments: 'appointments',
  consultations: 'consultations',
  payments: 'payments',
};

/** Main sync function: push unsynced records, pull delta from Supabase */
async function syncToSupabase() {
  if (!state.isOnline || !supabaseClient) return;
  updateSyncPill('syncing');

  try {
    for (const [localTable, remoteTable] of Object.entries(SYNC_TABLE_MAP)) {
      const unsynced = await db[localTable].filter((r) => !r.synced || r.synced === 0).toArray();

      for (const record of unsynced) {
        // Strip local-only fields
        const { localId, synced, ...remoteRecord } = record;

        // Ensure clinic_id
        if (!remoteRecord.clinic_id) remoteRecord.clinic_id = state.currentClinicId;

        const { error } = await supabaseClient.from(remoteTable).upsert(remoteRecord);
        if (!error) {
          await db[localTable].update(record.localId, {
            synced: 1,
            synced_at: new Date().toISOString(),
          });
        }
      }

      // Pull delta: records updated after lastSyncTime
      if (state.lastSyncTime && state.currentClinicId) {
        const { data: pulled } = await supabaseClient
          .from(remoteTable)
          .select('*')
          .eq('clinic_id', state.currentClinicId)
          .gt('updated_at', state.lastSyncTime);

        if (pulled && pulled.length > 0) {
          for (const row of pulled) {
            const existing = await db[localTable]
              .filter((r) => r.id === row.id)
              .first();
            if (existing) {
              await db[localTable].update(existing.localId, { ...row, synced: 1 });
            } else {
              await db[localTable].add({ ...row, synced: 1 });
            }
          }
        }
      }
    }

    state.lastSyncTime = new Date().toISOString();
    updateSyncPill('online-synced');
  } catch (err) {
    console.error('Sync error:', err);
    updateSyncPill('offline');
  }
}

// Network event listeners
window.addEventListener('online', () => {
  state.isOnline = true;
  updateSyncPill('syncing');
  syncToSupabase().catch(() => updateSyncPill('offline'));
});

window.addEventListener('offline', () => {
  state.isOnline = false;
  updateSyncPill('offline');
});

// Periodic sync every 60 seconds when online
setInterval(() => {
  if (state.isOnline) syncToSupabase().catch(() => {});
}, 60000);

// ===========================================================================
// === SECTION 8: 80KB IMAGE COMPRESSOR ======================================
// ===========================================================================

/**
 * Compress an image file to ~60-80KB
 * @param {File} file - Input image file
 * @returns {Promise<string>} - Base64 JPEG data URL
 */
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 1000;
        let { width, height } = img;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Apply grayscale + contrast + brightness filter
        ctx.filter = 'grayscale(100%) contrast(1.3) brightness(1.1)';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===========================================================================
// === SECTION 9: SCREEN 1 — RECEPTION & TRIAGE LOGIC =======================
// ===========================================================================

/** Currently selected patient for triage */
let _activeTriagePatient = null;

/** Initialize reception screen */
function initReceptionScreen() {
  renderBookingInbox();
  renderPatientSearch();
  checkRefillsDue();
}

/** Render patient search input with debounced live search */
function renderPatientSearch() {
  const searchInput = document.getElementById('patient-search-input');
  if (!searchInput) return;

  const dropdown = document.getElementById('patient-search-dropdown');

  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      if (dropdown) dropdown.innerHTML = '';
      return;
    }
    const results = await searchPatients(query);
    if (!dropdown) return;
    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-no-result">No patients found</div>';
      return;
    }
    dropdown.innerHTML = results
      .map(
        (p) => `
      <div class="search-result-item" data-localid="${p.localId}" role="button" tabindex="0">
        <strong>${p.full_name}</strong> — ${p.phone}
        ${p.blood_group ? `<span class="pill">${p.blood_group}</span>` : ''}
      </div>`
      )
      .join('');

    dropdown.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const patient = await getPatientById(Number(el.dataset.localid));
        if (patient) selectPatient(patient);
        dropdown.innerHTML = '';
        searchInput.value = patient ? patient.full_name : '';
      });
    });
  }, 200);

  searchInput.addEventListener('keyup', (e) => doSearch(e.target.value));
}

/** Select a patient for triage */
function selectPatient(patient) {
  _activeTriagePatient = patient;
  renderTriagePanel(patient);
}

/** Render the triage panel for a selected patient */
function renderTriagePanel(patient) {
  const panel = document.getElementById('triage-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="patient-banner">
      <h3>${patient.full_name}</h3>
      <p>📞 ${patient.phone} &nbsp;|&nbsp; 🩸 ${patient.blood_group || 'N/A'} &nbsp;|&nbsp; ⚠️ Allergies: <span style="color:#dc2626">${patient.allergies || 'None'}</span></p>
    </div>
    <form id="vitals-form" class="vitals-form">
      <div class="form-row">
        <label>BP Systolic <input type="number" name="bp_systolic" min="60" max="250" /></label>
        <label>BP Diastolic <input type="number" name="bp_diastolic" min="40" max="150" /></label>
        <label>Temp (°C) <input type="number" name="temperature" step="0.1" min="35" max="42" /></label>
      </div>
      <div class="form-row">
        <label>Pulse (bpm) <input type="number" name="pulse_rate" min="30" max="250" /></label>
        <label>RR (breaths/min) <input type="number" name="respiratory_rate" min="8" max="60" /></label>
        <label>Weight (kg) <input type="number" name="weight_kg" step="0.1" min="1" max="300" /></label>
        <label>SpO₂ (%) <input type="number" name="spo2" min="50" max="100" /></label>
      </div>
      <div class="form-group">
        <label>Presenting Complaint
          <textarea name="chief_complaint" rows="2" placeholder="e.g. Fever and cough for 3 days"></textarea>
        </label>
      </div>
      <div class="form-group">
        <label>📁 Snap Paper Folder (optional)
          <input type="file" id="paper-folder-input" accept="image/*" capture="environment" />
        </label>
        <div id="folder-thumb-preview"></div>
      </div>
      <button type="submit" class="btn btn-primary">✅ Triage &amp; Send to Doctor</button>
    </form>`;

  const vitalsForm = document.getElementById('vitals-form');
  if (vitalsForm) vitalsForm.addEventListener('submit', handleVitalsSubmit);

  const paperInput = document.getElementById('paper-folder-input');
  if (paperInput) paperInput.addEventListener('change', handlePaperFolderSnap);
}

/** Render the booking inbox (pending appointments) */
async function renderBookingInbox() {
  const inbox = document.getElementById('booking-inbox');
  if (!inbox) return;
  const pending = await getAppointments({ status: 'pending' });
  if (pending.length === 0) {
    inbox.innerHTML = '<p class="empty-state">No pending bookings.</p>';
    return;
  }
  inbox.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Phone</th><th>Token</th><th>Dept</th><th>Action</th></tr></thead>
      <tbody>
        ${pending
          .map(
            (a) => `
          <tr>
            <td>${a.patient_name || '—'}</td>
            <td>${a.phone}</td>
            <td><strong>${a.queue_token}</strong></td>
            <td>${a.department || '—'}</td>
            <td><button class="btn btn-sm btn-primary" onclick="confirmBooking(${a.localId})">Confirm</button></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

/** Confirm a booking: mark confirmed, link/create patient, show vitals form */
async function confirmBooking(apptLocalId) {
  const appt = await db.appointments.get(apptLocalId);
  if (!appt) return;
  await db.appointments.update(apptLocalId, { status: 'confirmed', synced: 0 });

  // Find or create patient record
  const existing = await db.patients.filter((p) => p.phone === appt.phone).first();
  let patient;
  if (existing) {
    patient = existing;
  } else {
    const newLocalId = await savePatient({
      full_name: appt.patient_name || 'Unknown',
      phone: appt.phone,
      clinic_id: appt.clinic_id,
    });
    patient = await getPatientById(newLocalId);
  }

  selectPatient(patient);
  renderBookingInbox();
}

/** Handle new patient modal form submission */
async function handleNewPatientForm() {
  const form = document.getElementById('new-patient-form');
  if (!form) return;
  const data = new FormData(form);
  const patientData = Object.fromEntries(data.entries());
  if (!patientData.full_name || !patientData.phone) {
    alert('Name and phone are required.');
    return;
  }
  const localId = await savePatient(patientData);
  const patient = await getPatientById(localId);
  // Close modal
  const modal = document.getElementById('new-patient-modal');
  if (modal) modal.style.display = 'none';
  if (patient) selectPatient(patient);
}

/** Handle vitals form submission */
async function handleVitalsSubmit(e) {
  e.preventDefault();
  if (!_activeTriagePatient) return;

  const form = e.target;
  const data = new FormData(form);
  const vitals = Object.fromEntries(data.entries());

  // Determine queue token
  const today = new Date().toISOString().split('T')[0];
  const todayConsults = await db.consultations
    .filter((c) => c.created_at && c.created_at.startsWith(today))
    .count();
  const queueToken = `TKN-${String(todayConsults + 1).padStart(3, '0')}`;

  const consultData = {
    patient_id: _activeTriagePatient.localId,
    clinic_id: state.currentClinicId,
    visit_date: today,
    bp_systolic: parseInt(vitals.bp_systolic) || null,
    bp_diastolic: parseInt(vitals.bp_diastolic) || null,
    temperature: parseFloat(vitals.temperature) || null,
    pulse_rate: parseInt(vitals.pulse_rate) || null,
    respiratory_rate: parseInt(vitals.respiratory_rate) || null,
    weight_kg: parseFloat(vitals.weight_kg) || null,
    spo2: parseInt(vitals.spo2) || null,
    soap_subjective: vitals.chief_complaint || '',
    queue_token: queueToken,
    status: 'triage',
    created_at: new Date().toISOString(),
  };

  if (window._pendingFolderSnap) {
    consultData.paper_folder_b64 = window._pendingFolderSnap;
    window._pendingFolderSnap = null;
  }

  await saveConsultation(consultData);

  const triage = document.getElementById('triage-panel');
  if (triage) {
    triage.innerHTML = `<div class="success-banner">✅ Patient <strong>${_activeTriagePatient.full_name}</strong> triaged with token <strong>${queueToken}</strong>. Now in doctor's queue.</div>`;
  }

  _activeTriagePatient = null;
  if (state.isOnline) syncToSupabase().catch(() => {});
  renderPatientQueue();
}

/** Handle paper folder file input (compress + preview) */
async function handlePaperFolderSnap(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('folder-thumb-preview');
  if (preview) preview.innerHTML = '<p>Compressing image…</p>';
  try {
    const dataUrl = await compressImage(file);
    window._pendingFolderSnap = dataUrl;
    if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="Folder preview" style="max-width:120px;border-radius:6px;margin-top:0.5rem;" />`;
  } catch (err) {
    if (preview) preview.innerHTML = '<p style="color:red">Image compression failed.</p>';
  }
}

// ===========================================================================
// === SECTION 10: SCREEN 2 — DOCTOR'S CONSULTATION PAD LOGIC ================
// ===========================================================================

/** Currently open consultation */
let _activeConsultationId = null;

/** Speech recognition instance */
let _recognition = null;

/** Initialize doctor screen */
function initDoctorScreen() {
  renderPatientQueue();
}

/** Render the patient queue sidebar */
async function renderPatientQueue() {
  const sidebar = document.getElementById('patient-queue-sidebar');
  if (!sidebar) return;

  const queue = await db.consultations
    .filter((c) => c.status === 'triage' || c.status === 'with_doctor')
    .toArray();

  if (queue.length === 0) {
    sidebar.innerHTML = '<p class="empty-state">No patients in queue.</p>';
    return;
  }

  const rows = await Promise.all(
    queue.map(async (c) => {
      const patient = await getPatientById(c.patient_id);
      const name = patient ? patient.full_name : 'Unknown';
      const bp = c.bp_systolic && c.bp_diastolic ? `${c.bp_systolic}/${c.bp_diastolic}` : '—';
      const temp = c.temperature ? `${c.temperature}°C` : '—';
      const bpAlert = c.bp_systolic >= 140 || c.bp_diastolic >= 90;
      const tempAlert = c.temperature >= 37.8;
      return `
        <div class="queue-card ${c.status === 'with_doctor' ? 'active' : ''}" onclick="selectPatientForConsultation(${c.localId})">
          <strong>${name}</strong> <span class="token-pill">${c.queue_token || ''}</span>
          <div class="vitals-mini">
            BP: <span style="color:${bpAlert ? '#dc2626' : 'inherit'}">${bp}</span>
            Temp: <span style="color:${tempAlert ? '#dc2626' : 'inherit'}">${temp}</span>
          </div>
        </div>`;
    })
  );

  sidebar.innerHTML = rows.join('');
}

/** Select a patient for consultation */
async function selectPatientForConsultation(consultationLocalId) {
  _activeConsultationId = consultationLocalId;
  const consult = await db.consultations.get(consultationLocalId);
  if (!consult) return;
  const patient = await getPatientById(consult.patient_id);
  if (!patient) return;

  await updateConsultationStatus(consultationLocalId, 'with_doctor');
  renderPatientQueue();

  const pastConsults = await getConsultationsForPatient(patient.localId);
  renderPatientTimeline(patient, pastConsults, consult);
  renderPrescriptionBuilder(consult);
}

/** Render patient timeline / biodata */
function renderPatientTimeline(patient, consultations, currentConsult) {
  const pad = document.getElementById('consultation-pad');
  if (!pad) return;

  const allergyStyle = patient.allergies ? 'color:#dc2626;font-weight:bold;' : '';
  const pastVisits = consultations
    .filter((c) => c.localId !== currentConsult.localId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const vitalsHtml = `
    <div class="vitals-grid">
      <span>BP: ${currentConsult.bp_systolic || '—'}/${currentConsult.bp_diastolic || '—'} mmHg</span>
      <span>Temp: ${currentConsult.temperature || '—'}°C</span>
      <span>Pulse: ${currentConsult.pulse_rate || '—'} bpm</span>
      <span>RR: ${currentConsult.respiratory_rate || '—'}/min</span>
      <span>Weight: ${currentConsult.weight_kg || '—'} kg</span>
      <span>SpO₂: ${currentConsult.spo2 || '—'}%</span>
    </div>`;

  const photoHtml = currentConsult.paper_folder_b64
    ? `<div class="folder-photo"><img src="${currentConsult.paper_folder_b64}" alt="Folder" style="max-width:150px;border-radius:6px;" /></div>`
    : '';

  const pastVisitsHtml =
    pastVisits.length > 0
      ? pastVisits
          .map(
            (c) => `
        <details class="past-visit">
          <summary>${c.visit_date || 'Unknown date'} — ${c.soap_assessment || 'No diagnosis'}</summary>
          <div class="past-visit-body">
            <p><strong>S:</strong> ${c.soap_subjective || '—'}</p>
            <p><strong>O:</strong> ${c.soap_objective || '—'}</p>
            <p><strong>A:</strong> ${c.soap_assessment || '—'}</p>
            <p><strong>P:</strong> ${c.soap_plan || '—'}</p>
          </div>
        </details>`
          )
          .join('')
      : '<p class="empty-state">No past visits on record.</p>';

  pad.innerHTML = `
    <div class="biodata-banner">
      <h3>${patient.full_name}</h3>
      <p>📞 ${patient.phone} &nbsp;|&nbsp; 🎂 DOB: ${patient.date_of_birth || '—'} &nbsp;|&nbsp; 🩸 ${patient.blood_group || '—'} / ${patient.genotype || '—'}</p>
      <p>⚠️ Allergies: <span style="${allergyStyle}">${patient.allergies || 'None known'}</span></p>
    </div>
    <h4>Current Visit Vitals</h4>
    ${vitalsHtml}
    ${photoHtml}
    <h4>Quick Chips</h4>
    <div class="quick-chips">
      ${['Uncomplicated Malaria','Typhoid Fever','Respiratory Tract Infection','Urinary Tract Infection','Gastroenteritis','Hypertension Review','Diabetes Review','Malaria in Pregnancy','Anaemia','Wound Dressing','Antenatal Care Visit']
        .map((chip) => `<button class="chip-btn" onclick="applyQuickChip('${chip}')">${chip}</button>`)
        .join('')}
    </div>
    <h4>SOAP Notes</h4>
    <div class="soap-section">
      <label>Subjective (History)
        <div class="voice-btn-wrap">
          <textarea id="soap-subjective" rows="3">${currentConsult.soap_subjective || ''}</textarea>
          <button type="button" class="btn btn-sm" onclick="startDictation('soap-subjective')">🎤 Dictate</button>
          <button type="button" class="btn btn-sm" onclick="stopDictation()">⏹ Stop</button>
        </div>
      </label>
      <label>Objective (Examination)
        <textarea id="soap-objective" rows="3">${currentConsult.soap_objective || ''}</textarea>
      </label>
      <label>Assessment (Diagnosis + ICD-10)
        <textarea id="soap-assessment" rows="2">${currentConsult.soap_assessment || ''}</textarea>
      </label>
      <label>Plan (Management)
        <textarea id="soap-plan" rows="3">${currentConsult.soap_plan || ''}</textarea>
      </label>
    </div>
    <h4>E-Prescription</h4>
    <div id="prescription-builder">
      <table class="rx-table" id="rx-table">
        <thead><tr><th>Drug &amp; Dosage</th><th>Frequency</th><th>Duration</th><th>Qty</th><th></th></tr></thead>
        <tbody id="rx-rows"></tbody>
      </table>
      <button type="button" class="btn btn-sm btn-secondary" onclick="addPrescriptionRow()">+ Add Drug</button>
    </div>
    <h4>Lab Orders</h4>
    <div id="lab-orders">
      ${renderLabOrderPanel()}
    </div>
    <h4>Past Visits</h4>
    <div class="past-visits">${pastVisitsHtml}</div>
    <div class="consult-actions">
      <button class="btn btn-primary btn-large" onclick="completeConsultation()">✅ Complete Consultation &amp; Send to Cashier</button>
    </div>`;

  // Add initial prescription row
  addPrescriptionRow();
}

/** Render lab order panel */
function renderLabOrderPanel() {
  const labs = [
    { name: 'FBC (Full Blood Count)', price: 3500 },
    { name: 'Malaria RDT', price: 1500 },
    { name: 'Malaria Microscopy', price: 2000 },
    { name: 'Urinalysis', price: 1500 },
    { name: 'Fasting Blood Sugar', price: 2000 },
    { name: 'HbA1c', price: 8000 },
    { name: 'Liver Function Test', price: 7500 },
    { name: 'Kidney Function Test', price: 7500 },
    { name: 'Lipid Profile', price: 8000 },
    { name: 'Thyroid Function Test', price: 12000 },
    { name: 'Hepatitis B Surface Antigen', price: 3000 },
    { name: 'Widal Test', price: 3000 },
    { name: 'Stool MCS', price: 4000 },
    { name: 'Urine MCS', price: 4500 },
    { name: 'HIV Screening', price: 2000 },
    { name: 'Pregnancy Test (Urine)', price: 1500 },
    { name: 'Blood Group & Genotype', price: 3000 },
    { name: 'Electrolytes & Urea', price: 7000 },
    { name: 'ECG', price: 5000 },
    { name: 'Chest X-Ray', price: 8000 },
  ];

  return `
    <div class="lab-grid">
      ${labs
        .map(
          (l, i) => `
        <label class="lab-item">
          <input type="checkbox" name="lab_${i}" value="${l.name}" data-price="${l.price}" />
          ${l.name} <span class="lab-price">₦${l.price.toLocaleString()}</span>
        </label>`
        )
        .join('')}
    </div>`;
}

/** Render the prescription builder (called on init) */
function renderPrescriptionBuilder(consult) {
  // Handled inline in renderPatientTimeline
}

let _rxRowCounter = 0;

/** Add a prescription row */
function addPrescriptionRow(drug = '', frequency = '', duration = '', qty = '') {
  const tbody = document.getElementById('rx-rows');
  if (!tbody) return;
  const id = ++_rxRowCounter;
  const row = document.createElement('tr');
  row.id = `rx-row-${id}`;
  row.innerHTML = `
    <td><input type="text" class="rx-drug" placeholder="e.g. Amoxicillin 500mg" value="${drug}" /></td>
    <td><select class="rx-freq">
      <option value="OD" ${frequency === 'OD' ? 'selected' : ''}>OD (Once daily)</option>
      <option value="BD" ${frequency === 'BD' ? 'selected' : ''}>BD (Twice daily)</option>
      <option value="TDS" ${frequency === 'TDS' ? 'selected' : ''}>TDS (Three times)</option>
      <option value="QDS" ${frequency === 'QDS' ? 'selected' : ''}>QDS (Four times)</option>
      <option value="Stat" ${frequency === 'Stat' ? 'selected' : ''}>Stat (Once now)</option>
      <option value="Nocte" ${frequency === 'Nocte' ? 'selected' : ''}>Nocte (At night)</option>
    </select></td>
    <td><input type="text" class="rx-duration" placeholder="e.g. 5/7 or 2wks" value="${duration}" /></td>
    <td><input type="number" class="rx-qty" placeholder="Qty" min="1" value="${qty}" style="width:60px;" /></td>
    <td><button type="button" class="btn btn-sm btn-danger" onclick="removePrescriptionRow(${id})">✕</button></td>`;
  tbody.appendChild(row);
}

/** Remove a prescription row */
function removePrescriptionRow(rowId) {
  const row = document.getElementById(`rx-row-${rowId}`);
  if (row) row.remove();
}

/** Collect all prescription rows into array */
function getPrescriptionData() {
  const rows = document.querySelectorAll('#rx-rows tr');
  const prescriptions = [];
  rows.forEach((row) => {
    const drug = row.querySelector('.rx-drug')?.value?.trim();
    const freq = row.querySelector('.rx-freq')?.value;
    const duration = row.querySelector('.rx-duration')?.value?.trim();
    const qty = row.querySelector('.rx-qty')?.value;
    if (drug) prescriptions.push({ drug, frequency: freq, duration, quantity: qty });
  });
  return prescriptions;
}

/** Collect checked lab orders */
function getLabOrderData() {
  const checkboxes = document.querySelectorAll('#lab-orders input[type="checkbox"]:checked');
  const labs = [];
  checkboxes.forEach((cb) => {
    labs.push({ name: cb.value, price: parseInt(cb.dataset.price) || 0 });
  });
  return labs;
}

/** Apply a clinical quick chip */
function applyQuickChip(chipName) {
  const chips = {
    'Uncomplicated Malaria': {
      soap_subjective: 'Patient presents with fever, chills, headache, body aches for ___ days. No neck stiffness. No seizures.',
      soap_assessment: 'Uncomplicated Plasmodium falciparum malaria (B50.9)',
      soap_plan: 'Commence ACT (Artemether-Lumefantrine). Adequate hydration. Tepid sponging for fever. Review if no improvement in 48 hours. Avoid self-medication.',
      prescriptions: [
        { drug: 'Artemether-Lumefantrine 80/480mg (Coartem)', frequency: 'BD', duration: '3/7', quantity: '6' },
        { drug: 'Paracetamol 1g', frequency: 'TDS', duration: '3/7', quantity: '9' },
        { drug: 'Vitamin C 500mg', frequency: 'OD', duration: '5/7', quantity: '5' },
      ],
    },
    'Typhoid Fever': {
      soap_subjective: 'Patient presents with prolonged fever (>5 days), headache, abdominal pain, constipation/diarrhoea, rose-coloured spots on trunk. Widal positive.',
      soap_assessment: 'Typhoid fever (A01.0)',
      soap_plan: 'Adequate hydration and electrolyte replacement. Soft diet. Avoid NSAIDs. Full course of antibiotics. Stool and hand hygiene counselling. Review in 5 days.',
      prescriptions: [
        { drug: 'Ciprofloxacin 500mg', frequency: 'BD', duration: '10/7', quantity: '20' },
        { drug: 'Paracetamol 1g', frequency: 'TDS', duration: '5/7', quantity: '15' },
        { drug: 'Oral Rehydration Salt (ORS)', frequency: 'TDS', duration: '5/7', quantity: '15' },
        { drug: 'Metronidazole 400mg', frequency: 'TDS', duration: '5/7', quantity: '15' },
      ],
    },
    'Respiratory Tract Infection': {
      soap_subjective: 'Patient presents with cough (productive/dry) for ___ days, sore throat, nasal congestion, low-grade fever, body malaise. No shortness of breath at rest.',
      soap_assessment: 'Acute upper respiratory tract infection (J06.9)',
      soap_plan: 'Adequate rest and hydration. Steam inhalation. Warm honey-lemon drinks. Avoid cold drinks. Prescribe symptomatic treatment. Return if symptoms worsen or dyspnoea develops.',
      prescriptions: [
        { drug: 'Amoxicillin-Clavulanate 625mg', frequency: 'BD', duration: '7/7', quantity: '14' },
        { drug: 'Bromhexine Syrup 8mg/5ml', frequency: 'TDS', duration: '5/7', quantity: '1' },
        { drug: 'Loratadine 10mg', frequency: 'OD', duration: '5/7', quantity: '5' },
        { drug: 'Paracetamol 1g', frequency: 'TDS', duration: '5/7', quantity: '15' },
      ],
    },
    'Urinary Tract Infection': {
      soap_subjective: 'Patient presents with burning micturition, frequency of urination, lower abdominal pain, cloudy/foul-smelling urine. Urinalysis shows leucocytes, nitrites.',
      soap_assessment: 'Acute uncomplicated urinary tract infection (N39.0)',
      soap_plan: 'Increase fluid intake (at least 2L water daily). Complete full course of antibiotics. Avoid bladder irritants (caffeine, alcohol). Peri-care hygiene. Review if no improvement in 3 days or fever develops.',
      prescriptions: [
        { drug: 'Nitrofurantoin 100mg (modified release)', frequency: 'BD', duration: '5/7', quantity: '10' },
        { drug: 'Ciprofloxacin 500mg', frequency: 'BD', duration: '5/7', quantity: '10' },
        { drug: 'Phenazopyridine 200mg', frequency: 'TDS', duration: '2/7', quantity: '6' },
      ],
    },
    'Gastroenteritis': {
      soap_subjective: 'Patient presents with vomiting (___ episodes), diarrhoea (___ stools/day), nausea, abdominal cramps, low-grade fever. Possible food history: ___.',
      soap_assessment: 'Acute gastroenteritis (A09)',
      soap_plan: 'Aggressive oral rehydration with ORS. BRAT diet (Banana, Rice, Apple, Toast). IV fluids if severely dehydrated. Stool MCS if bloody stool. Isolate at home and enforce hand hygiene.',
      prescriptions: [
        { drug: 'ORS Sachets', frequency: 'After each loose stool', duration: '3/7', quantity: '10' },
        { drug: 'Metronidazole 400mg', frequency: 'TDS', duration: '5/7', quantity: '15' },
        { drug: 'Buscopan (Hyoscine) 10mg', frequency: 'TDS', duration: '3/7', quantity: '9' },
        { drug: 'Zinc Sulphate 20mg', frequency: 'OD', duration: '10/7', quantity: '10' },
        { drug: 'Loperamide 2mg', frequency: 'After each loose stool (max 8/day)', duration: '2/7', quantity: '8' },
      ],
    },
    'Hypertension Review': {
      soap_subjective: 'Patient presents for hypertension review. Complains of headache / no complaints. BP today: ___/___. HBPM readings at home: ___. Medication compliance: Good / Fair / Poor.',
      soap_assessment: 'Essential (primary) hypertension — Stage ___ (I10)',
      soap_plan: 'Continue antihypertensive medications. DASH diet counselling. Reduce salt intake to <5g/day. Regular aerobic exercise 30min/day, 5 days/week. Avoid alcohol and smoking. Monitor BP twice daily. Review in 4 weeks or earlier if BP uncontrolled. Order ECG, kidney function, fasting lipids if not done in past 6 months.',
      prescriptions: [
        { drug: 'Amlodipine 5mg', frequency: 'OD', duration: '30/7 (1 month)', quantity: '30' },
        { drug: 'Lisinopril 5mg', frequency: 'OD', duration: '30/7 (1 month)', quantity: '30' },
        { drug: 'Hydrochlorothiazide 25mg', frequency: 'OD', duration: '30/7 (1 month)', quantity: '30' },
      ],
    },
    'Diabetes Review': {
      soap_subjective: 'Patient presents for diabetes review. FBS today: ___ mg/dL. RBS: ___. HbA1c: ___%. Symptoms of hypoglycaemia: Yes/No. Foot check: ___.',
      soap_assessment: 'Type 2 diabetes mellitus without complications (E11.9)',
      soap_plan: 'Optimise glycaemic control. Low-glycaemic index diet. Regular exercise. Foot care education — daily foot inspection, moisture cream. Eye review annually. Kidney function and lipids monitoring. Review in 3 months with HbA1c.',
      prescriptions: [
        { drug: 'Metformin 500mg', frequency: 'BD (with meals)', duration: '30/7', quantity: '60' },
        { drug: 'Glibenclamide 5mg', frequency: 'OD (before breakfast)', duration: '30/7', quantity: '30' },
        { drug: 'Aspirin 75mg', frequency: 'OD', duration: '30/7', quantity: '30' },
        { drug: 'Atorvastatin 20mg', frequency: 'Nocte', duration: '30/7', quantity: '30' },
      ],
    },
    'Malaria in Pregnancy': {
      soap_subjective: 'Pregnant patient (EGA: ___ weeks) presents with fever, chills, headache, body weakness. Last malaria treatment: ___.',
      soap_assessment: 'Malaria complicating pregnancy (O98.6 / B54)',
      soap_plan: 'Avoid artemisinin-based therapy in 1st trimester. Use Quinine + Clindamycin in 1st trimester. ACT (Artemether-Lumefantrine) safe in 2nd and 3rd trimester. Encourage IPTp with Sulfadoxine-Pyrimethamine at each ANC visit (from 16 weeks). Insecticide-treated bed net. Iron and folate supplementation.',
      prescriptions: [
        { drug: 'Artemether-Lumefantrine 80/480mg (2nd/3rd trimester)', frequency: 'BD', duration: '3/7', quantity: '6' },
        { drug: 'Paracetamol 1g', frequency: 'TDS', duration: '3/7', quantity: '9' },
        { drug: 'Ferrous Sulphate 200mg + Folic Acid 0.4mg', frequency: 'OD', duration: '30/7', quantity: '30' },
        { drug: 'Vitamin C 500mg', frequency: 'OD', duration: '7/7', quantity: '7' },
      ],
    },
    'Anaemia': {
      soap_subjective: 'Patient presents with easy fatigability, pallor, dizziness, palpitations, shortness of breath on exertion. Haemoglobin: ___ g/dL. Blood group: ___.',
      soap_assessment: 'Iron deficiency anaemia (D50.9)',
      soap_plan: 'Iron-rich diet (green vegetables, beans, meat). Vitamin C co-administration to enhance absorption. Avoid tea/coffee with meals. Rule out underlying cause (menorrhagia, GI bleed, hookworm). Repeat FBC in 6 weeks. Transfusion if Hb <7g/dL with symptoms.',
      prescriptions: [
        { drug: 'Ferrous Sulphate 200mg', frequency: 'TDS (between meals)', duration: '30/7', quantity: '90' },
        { drug: 'Vitamin C 500mg', frequency: 'TDS', duration: '30/7', quantity: '90' },
        { drug: 'Folic Acid 5mg', frequency: 'OD', duration: '30/7', quantity: '30' },
        { drug: 'Mebendazole 500mg', frequency: 'Stat (single dose for deworming)', duration: '1 day', quantity: '1' },
      ],
    },
    'Wound Dressing': {
      soap_subjective: 'Patient presents with wound on ___. Size: ___ cm. Character: clean/sloughy/infected. Last dressing: ___. Tetanus immunisation status: ___.',
      soap_assessment: 'Open wound requiring dressing (T14.0)',
      soap_plan: 'Wound irrigation with normal saline. Debridement if sloughy. Apply appropriate dressing (non-adherent/hydrocolloid/povidone-iodine). Antibiotics if signs of infection. Tetanus prophylaxis (Td vaccine) if not up to date. Daily/alternate day dressing. Review progress in ___ days.',
      prescriptions: [
        { drug: 'Amoxicillin-Clavulanate 625mg', frequency: 'BD', duration: '7/7', quantity: '14' },
        { drug: 'Metronidazole 400mg', frequency: 'TDS', duration: '5/7', quantity: '15' },
        { drug: 'Paracetamol 1g', frequency: 'TDS', duration: '5/7', quantity: '15' },
        { drug: 'Ibuprofen 400mg', frequency: 'TDS (with food)', duration: '5/7', quantity: '15' },
      ],
    },
    'Antenatal Care Visit': {
      soap_subjective: 'Routine ANC visit. EGA: ___ weeks. LMP: ___. EDD: ___. Parity: G___P___. Complaints: oedema/backache/vaginal discharge/foetal movement — good/reduced. Last visit BP: ___/___.',
      soap_assessment: 'Antenatal care supervision — normal pregnancy (Z34)',
      soap_plan: 'Foetal heartbeat checked. Fundal height measured. Urine dipstick done. BP and weight recorded. IPTp-SP given (if 16+ weeks and 4+ weeks from last dose). Counsel on danger signs, nutrition, birth preparedness. Iron + folic acid continued. Next ANC in 4 weeks (or 2 weeks if >36 weeks).',
      prescriptions: [
        { drug: 'Ferrous Sulphate 200mg + Folic Acid 0.4mg', frequency: 'OD', duration: '30/7', quantity: '30' },
        { drug: 'Calcium Carbonate 1g', frequency: 'BD', duration: '30/7', quantity: '60' },
        { drug: 'Sulfadoxine-Pyrimethamine (SP) 3 tabs IPTp', frequency: 'Stat', duration: 'Single dose today', quantity: '3' },
        { drug: 'Vitamin D3 400IU', frequency: 'OD', duration: '30/7', quantity: '30' },
      ],
    },
  };

  const chip = chips[chipName];
  if (!chip) return;

  const subjEl = document.getElementById('soap-subjective');
  const assessEl = document.getElementById('soap-assessment');
  const planEl = document.getElementById('soap-plan');

  if (subjEl) subjEl.value = chip.soap_subjective;
  if (assessEl) assessEl.value = chip.soap_assessment;
  if (planEl) planEl.value = chip.soap_plan;

  // Clear existing prescription rows
  const rxRows = document.getElementById('rx-rows');
  if (rxRows) rxRows.innerHTML = '';
  _rxRowCounter = 0;

  chip.prescriptions.forEach((rx) => {
    addPrescriptionRow(rx.drug, rx.frequency, rx.duration, rx.quantity);
  });
}

/** Start voice dictation into a textarea */
function startDictation(targetTextareaId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Voice dictation is not supported in this browser. Please use Chrome on Android or Desktop.');
    return;
  }

  if (_recognition) {
    _recognition.stop();
    _recognition = null;
  }

  _recognition = new SpeechRecognition();
  _recognition.continuous = true;
  _recognition.interimResults = true;
  _recognition.lang = 'en-NG';

  const textarea = document.getElementById(targetTextareaId);
  if (!textarea) return;

  const originalText = textarea.value;

  _recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    textarea.value = originalText + final + interim;
  };

  _recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      alert('Microphone access denied. Please allow microphone in browser settings.');
    }
  };

  _recognition.start();
}

/** Stop voice dictation */
function stopDictation() {
  if (_recognition) {
    _recognition.stop();
    _recognition = null;
  }
}

/** Complete a consultation and send to cashier */
async function completeConsultation() {
  if (!_activeConsultationId) return;

  const prescriptions = getPrescriptionData();
  const labOrders = getLabOrderData();

  const updateData = {
    soap_subjective: document.getElementById('soap-subjective')?.value || '',
    soap_objective: document.getElementById('soap-objective')?.value || '',
    soap_assessment: document.getElementById('soap-assessment')?.value || '',
    soap_plan: document.getElementById('soap-plan')?.value || '',
    prescriptions_json: JSON.stringify(prescriptions),
    lab_orders_json: JSON.stringify(labOrders),
    status: 'awaiting_payment',
    doctor_id: state.currentUser?.id || null,
    updated_at: new Date().toISOString(),
    synced: 0,
  };

  const consult = await db.consultations.get(_activeConsultationId);
  await db.consultations.update(_activeConsultationId, updateData);
  await addToSyncQueue('consultations', _activeConsultationId, 'update');

  // Update appointment status if linked
  if (consult && consult.appointment_id) {
    await db.appointments.update(consult.appointment_id, { status: 'in_progress', synced: 0 });
  }

  if (state.isOnline) syncToSupabase().catch(() => {});

  const pad = document.getElementById('consultation-pad');
  if (pad) {
    pad.innerHTML = `<div class="success-banner">✅ Consultation completed. Patient sent to cashier.</div>`;
  }

  _activeConsultationId = null;
  renderPatientQueue();
  renderPendingBills();
}

// ===========================================================================
// === SECTION 11: SCREEN 3 — CASHIER, ANTI-LEAKAGE & WHATSAPP LOGIC ========
// ===========================================================================

/** Initialize cashier screen */
function initCashierScreen() {
  renderPendingBills();
}

/** Render pending bills queue */
async function renderPendingBills() {
  const queue = document.getElementById('pending-bills-list') || document.getElementById('pending-bills-queue');
  const emptyEl = document.getElementById('cashier-empty');
  if (!queue) return;

  const pending = await db.consultations
    .filter((c) => c.status === 'awaiting_payment')
    .toArray();

  if (pending.length === 0) {
    queue.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  const cards = await Promise.all(
    pending.map(async (c) => {
      const patient = await getPatientById(c.patient_id);
      const name = patient ? patient.full_name : 'Unknown';
      const labOrders = c.lab_orders_json ? JSON.parse(c.lab_orders_json) : [];
      const prescriptions = c.prescriptions_json ? JSON.parse(c.prescriptions_json) : [];
      const labTotal = labOrders.reduce((sum, l) => sum + (l.price || 0), 0);
      const rxTotal = prescriptions.reduce((sum, r) => sum + (r.amount || 0), 0);
      const consultFee = c.consultation_fee || 5000;
      const total = consultFee + labTotal + rxTotal;
      const diagnosisText = c.soap_assessment || 'General Consultation';

      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4" id="bill-card-${c.localId}">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold text-gray-800">${name}</h3>
              <p class="text-sm text-gray-500">${patient?.phone || ''} • Token: <span class="font-mono font-bold text-primary-700">${c.queue_token || '—'}</span></p>
              <p class="text-xs text-gray-400 mt-1">Diagnosis: <strong>${diagnosisText}</strong></p>
            </div>
            <div class="text-right">
              <span class="text-xs text-gray-500 uppercase font-semibold">Total Bill</span>
              <div class="text-3xl font-extrabold text-primary-700">₦${total.toLocaleString('en-NG')}</div>
            </div>
          </div>

          <!-- Itemized Breakdown -->
          <div class="border border-gray-100 rounded-xl overflow-hidden mb-4 bg-gray-50">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 text-xs font-semibold text-gray-600 uppercase">
                <tr><th class="px-4 py-2 text-left">Item Description</th><th class="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr><td class="px-4 py-2 text-gray-700">Doctor Consultation Fee</td><td class="px-4 py-2 text-right font-medium">₦${consultFee.toLocaleString('en-NG')}</td></tr>
                ${labOrders.map(l => `<tr><td class="px-4 py-2 text-gray-700">🧪 Lab: ${l.name}</td><td class="px-4 py-2 text-right font-medium">₦${l.price.toLocaleString('en-NG')}</td></tr>`).join('')}
                ${prescriptions.map(r => `<tr><td class="px-4 py-2 text-gray-700">💊 Drug: ${r.drug} (${r.dose} ${r.frequency})</td><td class="px-4 py-2 text-right font-medium">₦${(r.amount||0).toLocaleString('en-NG')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>

          <!-- Payment tender selector -->
          <div class="mb-4">
            <label class="block text-xs font-bold text-gray-600 uppercase mb-2">Payment Method:</label>
            <div class="flex gap-2">
              <button type="button" class="pay-tender-btn px-4 py-2 rounded-lg text-sm font-semibold border bg-primary-600 text-white border-primary-600" onclick="selectPaymentTender('cash', ${c.localId}, this)">💵 Cash</button>
              <button type="button" class="pay-tender-btn px-4 py-2 rounded-lg text-sm font-semibold border bg-white text-gray-700 border-gray-300 hover:bg-gray-50" onclick="selectPaymentTender('pos', ${c.localId}, this)">💳 POS Terminal</button>
              <button type="button" class="pay-tender-btn px-4 py-2 rounded-lg text-sm font-semibold border bg-white text-gray-700 border-gray-300 hover:bg-gray-50" onclick="selectPaymentTender('transfer', ${c.localId}, this)">🏦 Bank Transfer</button>
            </div>
            <input type="hidden" id="pay-method-${c.localId}" value="cash" />
            <div id="transfer-details-${c.localId}" class="hidden mt-3 grid grid-cols-2 gap-3">
              <input type="text" id="transfer-bank-${c.localId}" placeholder="Bank Name (e.g. GTBank, Zenith)" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
              <input type="text" id="transfer-ref-${c.localId}" placeholder="Transfer Reference / Session ID" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm" />
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row gap-3">
            <button class="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3.5 rounded-xl transition-colors text-base" onclick="confirmPaymentAndLock(${c.localId}, ${total})">
              ✅ Confirm Payment &amp; Issue Receipt
            </button>
            <button class="sm:w-auto bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-semibold px-4 py-3.5 rounded-xl text-sm transition-colors" onclick="toggleChronicPatient(${c.patient_id})">
              🔁 Mark as Chronic/ANC
            </button>
          </div>
        </div>`;
    })
  );

  queue.innerHTML = cards.join('');
}

/** Currently selected payment methods per consultation */
const _payMethods = {};

/** Select payment method for a consultation */
function selectPaymentMethod(method, consultId) {
  _payMethods[consultId] = method;
  const transferFields = document.getElementById(`transfer-fields-${consultId}`);
  if (transferFields) {
    transferFields.style.display = method === 'transfer' ? 'block' : 'none';
  }
  // Highlight active button
  const card = document.getElementById(`bill-card-${consultId}`);
  if (card) {
    card.querySelectorAll('.payment-method-selector .btn').forEach((btn) => btn.classList.remove('active'));
    const btns = card.querySelectorAll('.payment-method-selector .btn');
    const methodIdx = { cash: 0, pos: 1, transfer: 2 };
    if (btns[methodIdx[method]]) btns[methodIdx[method]].classList.add('active');
  }
}

/** Confirm payment for a consultation */
async function confirmPayment(consultationLocalId, patientPhone) {
  const method = _payMethods[consultationLocalId] || 'cash';
  const consultFee = parseFloat(document.getElementById(`consult-fee-${consultationLocalId}`)?.value || '0');
  const labFee = parseFloat(document.getElementById(`lab-fee-${consultationLocalId}`)?.value || '0');
  const otherFee = parseFloat(document.getElementById(`other-fee-${consultationLocalId}`)?.value || '0');
  const totalAmount = consultFee + labFee + otherFee;

  const transferRef = document.getElementById(`transfer-ref-${consultationLocalId}`)?.value || '';
  const transferBank = document.getElementById(`transfer-bank-${consultationLocalId}`)?.value || '';

  const consult = await db.consultations.get(consultationLocalId);
  const patient = await getPatientById(consult.patient_id);

  const today = new Date();
  const dateStr = formatDateYMD(today);
  const paymentCount = await db.payments.filter((p) => p.payment_date === today.toISOString().split('T')[0]).count();
  const receiptNumber = `RX-${dateStr}-${String(paymentCount + 1).padStart(3, '0')}`;

  const paymentData = {
    consultation_id: consultationLocalId,
    clinic_id: state.currentClinicId,
    patient_id: consult.patient_id,
    receipt_number: receiptNumber,
    amount: totalAmount,
    consult_fee: consultFee,
    lab_fee: labFee,
    other_fee: otherFee,
    payment_method: method,
    transfer_reference: method === 'transfer' ? transferRef : null,
    bank_name: method === 'transfer' ? transferBank : null,
    cashier_id: state.currentUser?.id || null,
    payment_date: today.toISOString().split('T')[0],
    is_locked: true,
  };

  const paymentLocalId = await savePayment(paymentData);

  // Update consultation status to completed
  await updateConsultationStatus(consultationLocalId, 'completed');

  // Lock payment record
  await lockPayment(paymentLocalId);

  // Render receipt
  generateReceipt({ ...paymentData, localId: paymentLocalId, patient, consultation: consult });

  if (state.isOnline) syncToSupabase().catch(() => {});
  renderPendingBills();
}

/** Generate and display receipt */
function generateReceipt(paymentData) {
  const receiptContainer = document.getElementById('receipt-area');
  if (!receiptContainer) return;

  const cfg = window.CLINIC_CONFIG;
  const patient = paymentData.patient;
  const patientName = patient ? patient.full_name : 'Patient';
  const now = new Date().toLocaleString('en-NG');

  receiptContainer.innerHTML = `
    <div class="receipt-card" id="receipt-${paymentData.receipt_number}">
      <div class="receipt-header">
        <h3>🏥 ${cfg.name}</h3>
        <p>${cfg.address}, ${cfg.city}</p>
        <p>📞 ${cfg.phone}</p>
        <hr />
        <h4>OFFICIAL RECEIPT</h4>
        <p>Receipt No: <strong>${paymentData.receipt_number}</strong></p>
        <p>Date: ${now}</p>
      </div>
      <div class="receipt-body">
        <p>Patient: <strong>${patientName}</strong></p>
        <p>Phone: ${patient?.phone || '—'}</p>
        <table class="receipt-table">
          <tr><td>Consultation Fee</td><td>₦${paymentData.consult_fee.toLocaleString()}</td></tr>
          <tr><td>Lab / Investigations</td><td>₦${paymentData.lab_fee.toLocaleString()}</td></tr>
          <tr><td>Other Charges</td><td>₦${paymentData.other_fee.toLocaleString()}</td></tr>
          <tr class="total-row"><td><strong>TOTAL</strong></td><td><strong>₦${paymentData.amount.toLocaleString()}</strong></td></tr>
        </table>
        <p>Payment Method: <strong>${paymentData.payment_method.toUpperCase()}</strong></p>
        ${paymentData.transfer_reference ? `<p>Reference: ${paymentData.transfer_reference} (${paymentData.bank_name})</p>` : ''}
      </div>
      <div class="receipt-footer">
        <p>🔒 This receipt is locked and tamper-proof.</p>
        <p>Thank you for choosing ${cfg.name}.</p>
        <p><small>Powered by ${cfg.vendorName}</small></p>
      </div>
      <div class="receipt-actions">
        <button class="btn btn-secondary" onclick="window.print()">🖨 Print Receipt</button>
        <button class="btn btn-secondary" onclick="generateWhatsAppMessage(${JSON.stringify(patient).replace(/"/g, '&quot;')}, ${JSON.stringify(paymentData.consultation).replace(/"/g, '&quot;')})">📲 WhatsApp Summary</button>
      </div>
    </div>`;
}

/** Generate and open WhatsApp message with treatment summary */
function generateWhatsAppMessage(patient, consultation) {
  const cfg = window.CLINIC_CONFIG;
  const prescriptions = consultation.prescriptions_json
    ? JSON.parse(consultation.prescriptions_json)
    : [];

  const drugList = prescriptions
    .map((rx) => `• ${rx.drug} — ${rx.frequency} for ${rx.duration}`)
    .join('\n');

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7);
  const nextDateStr = nextDate.toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let message = cfg.whatsappTemplates.followUp || '';
  message = message
    .replace(/{patientName}/g, patient.full_name || 'Patient')
    .replace(/{drugs}/g, drugList || 'As prescribed')
    .replace(/{nextDate}/g, nextDateStr)
    .replace(/{clinicName}/g, cfg.name);

  const waUrl = `https://wa.me/${patient.phone ? patient.phone.replace(/\D/g, '') : cfg.whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank', 'noopener');
}

/** Mark a patient as chronic */
async function markAsChronicPatient(patientLocalId, chronicType) {
  const today = new Date().toISOString().split('T')[0];
  await db.patients.update(patientLocalId, {
    is_chronic: true,
    chronic_type: chronicType || 'General',
    last_refill_date: today,
    synced: 0,
  });
  await addToSyncQueue('patients', patientLocalId, 'update');
  alert('Patient marked as chronic. Refill reminder set for 30 days.');
}

/** Check for chronic patients due for refill */
async function checkRefillsDue() {
  const banner = document.getElementById('refill-alert-banner');
  if (!banner) return;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffStr = thirtyDaysAgo.toISOString().split('T')[0];

  const duePatients = await db.patients
    .filter((p) => {
      if (!p.is_chronic) return false;
      if (!p.last_refill_date) return true;
      return p.last_refill_date <= cutoffStr;
    })
    .toArray();

  if (duePatients.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="refill-alert">
      🔔 <strong>${duePatients.length} chronic patient(s)</strong> are due for medication refill:
      ${duePatients.map((p) => `<strong>${p.full_name}</strong> (${p.phone})`).join(', ')}
    </div>`;
}

// ===========================================================================
// === SECTION 12: SCREEN 4 — MEDICAL DIRECTOR DASHBOARD LOGIC ===============
// ===========================================================================

/** Initialize director dashboard */
async function initDirectorDashboard(period) {
  period = period || 'today';
  const now = new Date();
  let startDate, endDate;

  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (period === 'week') {
    const day = now.getDay();
    startDate = new Date(now);
    startDate.setDate(now.getDate() - day);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const payments = await getPaymentsByDateRange(startDate.toISOString(), endDate.toISOString());
  renderRevenueSummary(payments, period);

  // Wire period selector buttons
  ['today', 'week', 'month'].forEach((p) => {
    const btn = document.getElementById(`period-${p}`);
    if (btn) {
      btn.addEventListener('click', () => initDirectorDashboard(p));
    }
  });
}

/** Render revenue summary on director dashboard */
function renderRevenueSummary(payments, period) {
  const totalRevenue = payments.reduce((sum, p) => sum + (p.total_amount || p.amount || 0), 0);
  const cashTotal = payments.reduce((sum, p) => sum + (p.cash_amount || (p.payment_method === 'cash' ? (p.total_amount || p.amount || 0) : 0)), 0);
  const posTotal = payments.reduce((sum, p) => sum + (p.pos_amount || (p.payment_method === 'pos' ? (p.total_amount || p.amount || 0) : 0)), 0);
  const transferTotal = payments.reduce((sum, p) => sum + (p.transfer_amount || (p.payment_method === 'transfer' ? (p.total_amount || p.amount || 0) : 0)), 0);
  const visitCount = payments.length;

  // Update Tailwind stat cards in index.html
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('rev-total', `₦${totalRevenue.toLocaleString('en-NG')}`);
  setText('rev-cash', `₦${cashTotal.toLocaleString('en-NG')}`);
  setText('rev-pos', `₦${posTotal.toLocaleString('en-NG')}`);
  setText('rev-transfer', `₦${transferTotal.toLocaleString('en-NG')}`);
  setText('rev-visit-count', `${visitCount} patient${visitCount !== 1 ? 's' : ''}`);

  // Update recent payments table in index.html
  const tbody = document.getElementById('recent-payments-table');
  if (tbody) {
    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">No payments recorded for this period.</td></tr>';
    } else {
      const methodLabels = { cash: '💵 Cash', pos: '💳 POS', transfer: '🏦 Transfer' };
      tbody.innerHTML = [...payments].reverse().slice(0, 20).map(p => `
        <tr class="border-t border-gray-100 hover:bg-gray-50">
          <td class="px-4 py-3 font-mono text-xs text-gray-500 font-bold">${p.receipt_number || '—'}</td>
          <td class="px-4 py-3 font-semibold text-gray-800 text-sm">${p.patient_name || 'Patient'}</td>
          <td class="px-4 py-3 text-xs text-gray-400">${p.payment_date || 'Today'}</td>
          <td class="px-4 py-3 text-xs font-medium">${methodLabels[p.payment_method || (p.cash_amount > 0 ? 'cash' : p.pos_amount > 0 ? 'pos' : 'transfer')] || 'Cash'}</td>
          <td class="px-4 py-3 text-right font-bold text-gray-800 text-sm">₦${(p.total_amount || p.amount || 0).toLocaleString('en-NG')}</td>
        </tr>
      `).join('');
    }
  }

  const container = document.getElementById('revenue-summary');
  if (!container) return;

  container.innerHTML = `
    <h3>Revenue Report — ${period ? period.charAt(0).toUpperCase() + period.slice(1) : 'Period'}</h3>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">₦${totalRevenue.toLocaleString()}</div><div class="stat-label">Total Revenue</div></div>
      <div class="stat-card"><div class="stat-value">₦${cashTotal.toLocaleString()}</div><div class="stat-label">Cash</div></div>
      <div class="stat-card"><div class="stat-value">₦${posTotal.toLocaleString()}</div><div class="stat-label">POS</div></div>
      <div class="stat-card"><div class="stat-value">₦${transferTotal.toLocaleString()}</div><div class="stat-label">Transfer</div></div>
      <div class="stat-card"><div class="stat-value">${visitCount}</div><div class="stat-label">Visits</div></div>
    </div>`;
}

/** Generate a locum doctor login */
async function generateLocumLogin() {
  const name = document.getElementById('locum-doctor-name')?.value?.trim();
  const specialty = document.getElementById('locum-specialty')?.value?.trim();
  const resultEl = document.getElementById('locum-result');

  if (!name) {
    if (resultEl) resultEl.innerHTML = '<p style="color:red">Doctor name is required.</p>';
    return;
  }

  if (resultEl) resultEl.innerHTML = '<p>Creating locum login…</p>';

  // Generate random email and password
  const slug = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');
  const timestamp = Date.now().toString(36);
  const email = `locum.${slug}.${timestamp}@${window.CLINIC_CONFIG.clinicId}.aqclinic.ng`;
  const password = Math.random().toString(36).slice(-8).toUpperCase() + Math.random().toString(36).slice(-4);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    // Create Supabase Auth user via admin API or Edge Function
    const { data, error } = await supabaseClient.rpc('create_locum_staff', {
      p_email: email,
      p_password: password,
      p_full_name: name,
      p_clinic_id: state.currentClinicId,
      p_specialty: specialty || 'General Practice',
      p_expires_at: expiresAt,
    });

    if (error) {
      if (resultEl) resultEl.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
      return;
    }

    // Update modal credentials in index.html
    const emailEl = document.getElementById('locum-cred-email');
    const passEl = document.getElementById('locum-cred-password');
    const expEl = document.getElementById('locum-cred-expiry');
    const credsBox = document.getElementById('locum-credentials');
    if (emailEl) emailEl.textContent = email;
    if (passEl) passEl.textContent = password;
    if (expEl) expEl.textContent = new Date(expiresAt).toLocaleString('en-NG');
    if (credsBox) credsBox.classList.remove('hidden');

    // Store in Dexie sessions so locum can log in even offline
    const locumId = uuidv4();
    await db.sessions.put({
      id: locumId,
      user_id: locumId,
      user: { id: locumId, email, full_name: `Dr. ${name}` },
      role: 'locum_doctor',
      clinic_id: state.currentClinicId || window.CLINIC_CONFIG.clinicId,
      expires_at: expiresAt,
    });

    if (resultEl) {
      resultEl.innerHTML = `
        <div class="success-banner" style="margin-top:1rem;">
          <p>✅ Locum login created successfully!</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Password:</strong> ${password}</p>
          <p><strong>Expires:</strong> ${new Date(expiresAt).toLocaleString('en-NG')}</p>
          <p style="color:#dc2626">⚠️ Share credentials securely. Valid for 24 hours only.</p>
        </div>`;
    }
  } catch (err) {
    // If Supabase RPC is offline/unreachable, create local offline locum session
    const locumId = uuidv4();
    await db.sessions.put({
      id: locumId,
      user_id: locumId,
      user: { id: locumId, email, full_name: `Dr. ${name}` },
      role: 'locum_doctor',
      clinic_id: state.currentClinicId || window.CLINIC_CONFIG.clinicId,
      expires_at: expiresAt,
    });
    const emailEl = document.getElementById('locum-cred-email');
    const passEl = document.getElementById('locum-cred-password');
    const expEl = document.getElementById('locum-cred-expiry');
    const credsBox = document.getElementById('locum-credentials');
    if (emailEl) emailEl.textContent = email;
    if (passEl) passEl.textContent = password;
    if (expEl) expEl.textContent = new Date(expiresAt).toLocaleString('en-NG');
    if (credsBox) credsBox.classList.remove('hidden');
    if (resultEl) {
      resultEl.innerHTML = `<p class="text-xs text-amber-600">Created offline locum credentials for Dr. ${name}.</p>`;
    }
  }
}

/** Export all clinic data as CSV */
async function exportCSV() {
  const patients = await db.patients.toArray();
  const consultations = await db.consultations.toArray();
  const payments = await db.payments.toArray();

  const csvSections = [];

  // Helper to convert array of objects to CSV
  const toCSV = (label, arr) => {
    if (!arr.length) return `${label}\n(No data)\n`;
    const keys = Object.keys(arr[0]);
    const header = keys.join(',');
    const rows = arr.map((obj) =>
      keys.map((k) => {
        let val = obj[k] ?? '';
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) val = `"${val}"`;
        return val;
      }).join(',')
    );
    return `${label}\n${header}\n${rows.join('\n')}\n`;
  };

  csvSections.push(toCSV('=== PATIENTS ===', patients));
  csvSections.push(toCSV('=== CONSULTATIONS ===', consultations));
  csvSections.push(toCSV('=== PAYMENTS ===', payments));

  const csvContent = csvSections.join('\n\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `${window.CLINIC_CONFIG.name.replace(/\s+/g, '_')}_export_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ===========================================================================
// === SECTION 13: SCREEN 5 — SUPER ADMIN LOGIC ==============================
// ===========================================================================

/** Initialize super admin screen */
async function initSuperAdmin() {
  const container = document.getElementById('super-admin-panel');
  if (!container) return;

  container.innerHTML = `
    <h3>Super Admin — Clinic Management</h3>
    <button class="btn btn-primary" onclick="document.getElementById('new-clinic-modal').style.display='flex'">➕ Register New Clinic</button>
    <div id="clinics-list"><p>Loading clinics…</p></div>
    <div id="new-clinic-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;align-items:center;justify-content:center;">
      <div class="modal-card">
        <h3>Register New Clinic</h3>
        <form id="new-clinic-form">
          <label>Clinic Name <input name="name" type="text" required /></label>
          <label>Slug (URL key) <input name="slug" type="text" required placeholder="e.g. sunrise-clinic" /></label>
          <label>Subscription Plan
            <select name="subscription_plan">
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="basic">Basic</option>
            </select>
          </label>
          <div id="new-clinic-result"></div>
          <div class="modal-actions">
            <button class="btn btn-primary" type="submit">Register</button>
            <button class="btn btn-secondary" type="button" onclick="document.getElementById('new-clinic-modal').style.display='none'">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  const form = document.getElementById('new-clinic-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      await registerNewClinic(data);
    });
  }

  loadAllClinics();
}

/** Load all clinics from Supabase */
async function loadAllClinics() {
  const listEl = document.getElementById('clinics-list');
  if (!listEl) return;

  try {
    const { data: clinics, error } = await supabaseClient
      .from('clinics')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = `<p style="color:red">Error loading clinics: ${error.message}</p>`;
      return;
    }

    if (!clinics || clinics.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No clinics registered yet.</p>';
      return;
    }

    listEl.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Name</th><th>Slug</th><th>Plan</th><th>Active</th><th>Created</th><th>Action</th></tr></thead>
        <tbody>
          ${clinics.map((c) => `
            <tr>
              <td>${c.name}</td>
              <td>${c.slug}</td>
              <td>${c.subscription_plan}</td>
              <td><span style="color:${c.is_active ? '#16a34a' : '#dc2626'}">${c.is_active ? '✅ Active' : '❌ Suspended'}</span></td>
              <td>${new Date(c.created_at).toLocaleDateString('en-NG')}</td>
              <td><button class="btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-primary'}" onclick="toggleClinicActive('${c.id}', ${c.is_active})">${c.is_active ? 'Suspend' : 'Activate'}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    if (listEl) listEl.innerHTML = `<p style="color:red">Network error: ${err.message}</p>`;
  }
}

/** Register a new clinic */
async function registerNewClinic(formData) {
  const resultEl = document.getElementById('new-clinic-result');
  if (resultEl) resultEl.innerHTML = '<p>Registering…</p>';

  try {
    const { data, error } = await supabaseClient
      .from('clinics')
      .insert([{
        name: formData.name,
        slug: formData.slug,
        subscription_plan: formData.subscription_plan || 'standard',
        is_active: true,
      }])
      .select()
      .single();

    if (error) {
      if (resultEl) resultEl.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
      return;
    }

    if (resultEl) {
      resultEl.innerHTML = `
        <div class="success-banner">
          <p>✅ Clinic registered successfully!</p>
          <p><strong>Clinic ID:</strong> ${data.id}</p>
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Slug:</strong> ${data.slug}</p>
        </div>`;
    }

    loadAllClinics();
  } catch (err) {
    if (resultEl) resultEl.innerHTML = `<p style="color:red">Network error: ${err.message}</p>`;
  }
}

/** Toggle clinic active state */
async function toggleClinicActive(clinicId, currentState) {
  const newState = !currentState;
  const confirmMsg = newState
    ? `Activate this clinic?`
    : `Suspend this clinic? All users will be locked out.`;

  if (!window.confirm(confirmMsg)) return;

  const { error } = await supabaseClient
    .from('clinics')
    .update({ is_active: newState })
    .eq('id', clinicId);

  if (error) {
    alert(`Error: ${error.message}`);
    return;
  }

  if (!newState) {
    // Trigger subscription lock awareness
    checkSubscriptionLock(false);
  }

  loadAllClinics();
}

// ===========================================================================
// === SECTION 14: BOOKING FORM & PATIENT PORTAL (ZONE 1 & 2) ================
// ===========================================================================

/** Handle booking form submission from public website */
async function handleBookingFormSubmit(event) {
  if (event) event.preventDefault();
  const form = document.getElementById('booking-form');
  const data = form ? Object.fromEntries(new FormData(form).entries()) : {};

  const name = (document.getElementById('book-name')?.value || data.patient_name || '').trim();
  const phone = (document.getElementById('book-phone')?.value || data.phone || '').trim();
  const dateVal = document.getElementById('book-date')?.value || data.preferred_date || '';
  const timeVal = document.getElementById('book-time')?.value || data.preferred_time || '';
  const deptVal = document.getElementById('book-dept')?.value || data.department || 'Outpatient Consultation';
  const reasonVal = (document.getElementById('book-reason')?.value || data.reason || '').trim();

  if (!phone || !name) {
    alert('Please enter your full name and phone number.');
    return;
  }

  const submitBtn = document.getElementById('btn-book-submit') || form?.querySelector('button[type="submit"]');
  const loading = document.getElementById('book-loading');
  if (submitBtn) submitBtn.disabled = true;
  if (loading) loading.classList.remove('hidden');

  try {
    const preferredDatetime = dateVal ? `${dateVal}T${timeVal || '09:00'}:00` : null;
    const { localId, queue_token } = await saveAppointment({
      patient_name: name,
      phone: phone,
      preferred_datetime: preferredDatetime,
      department: deptVal,
      reason: reasonVal,
      clinic_id: window.CLINIC_CONFIG.clinicId,
      source: 'website',
    });

    // Attempt Supabase push if online
    if (state.isOnline) syncToSupabase().catch(() => {});

    // Show success state
    const successEl = document.getElementById('booking-success');
    const tokenDisplay = document.getElementById('success-token');
    if (form) {
      form.classList.add('hidden');
      form.style.display = 'none';
    }
    if (tokenDisplay) tokenDisplay.textContent = queue_token;
    if (successEl) {
      successEl.classList.remove('hidden');
      successEl.style.display = 'block';
    }
    renderBookingInbox();
  } catch (err) {
    alert('Booking failed: ' + err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (loading) loading.classList.add('hidden');
  }
}

/** Check queue status for a phone or token */
async function checkQueueStatus(phoneOrToken) {
  const query = (phoneOrToken || '').trim();
  if (!query) return null;

  const qUpper = query.toUpperCase();

  // Search appointments by token or phone
  let appt = await db.appointments.filter((a) =>
    a.queue_token === qUpper || a.phone === query
  ).first();

  // Search consultations
  let consult = null;
  if (appt) {
    consult = await db.consultations.filter((c) =>
      c.queue_token === appt.queue_token
    ).first();
  } else {
    consult = await db.consultations.filter((c) =>
      c.queue_token === qUpper
    ).first();
  }

  if (!appt && !consult) return null;

  // Count patients ahead in queue
  let queuePosition = 0;
  let aheadCount = 0;

  if (consult) {
    const allInQueue = await db.consultations
      .filter((c) => c.status === 'triage' || c.status === 'with_doctor')
      .toArray();
    const sortedQueue = allInQueue.sort((a, b) => a.localId - b.localId);
    const idx = sortedQueue.findIndex((c) => c.localId === consult.localId);
    queuePosition = idx + 1;
    aheadCount = Math.max(0, idx);
  }

  // Check if prescription is released
  let prescriptionSummary = null;
  if (consult && (consult.status === 'completed' || consult.status === 'awaiting_payment')) {
    if (consult.prescriptions_json) {
      const rxArr = JSON.parse(consult.prescriptions_json);
      prescriptionSummary = rxArr.map((rx) => `${rx.drug} — ${rx.frequency} for ${rx.duration}`).join(', ');
    }
  }

  return {
    token: appt ? appt.queue_token : consult?.queue_token,
    status: consult ? consult.status : (appt ? appt.status : 'unknown'),
    queuePosition,
    aheadCount,
    estimatedWaitMinutes: aheadCount * 15,
    prescriptionSummary,
    patientName: appt ? appt.patient_name : null,
  };
}

/** Render queue status result card */
function renderQueueStatus(result) {
  const portalResults = document.getElementById('portal-results');
  if (portalResults) {
    if (!result) {
      portalResults.classList.remove('hidden');
      portalResults.innerHTML = `
        <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-center text-sm text-red-700">
          ❌ No booking or queue record found for that phone number or token. Please check and try again.
        </div>`;
    } else {
      portalResults.classList.remove('hidden');
      const nameEl = document.getElementById('portal-patient-name');
      if (nameEl) nameEl.textContent = result.patientName || 'Patient';
      const tokenEl = document.getElementById('portal-token');
      if (tokenEl) tokenEl.textContent = result.token || '—';
      const posEl = document.getElementById('portal-queue-pos');
      if (posEl) posEl.textContent = result.queuePosition > 0 ? `#${result.queuePosition}` : 'Next';
      const waitEl = document.getElementById('portal-wait-time');
      if (waitEl) waitEl.textContent = result.queuePosition > 0 ? `~${result.estimatedWaitMinutes} min` : 'Now';
      const badgeEl = document.getElementById('portal-status-badge');
      if (badgeEl) {
        badgeEl.textContent = result.status.toUpperCase();
        badgeEl.className = 'px-3 py-1 rounded-full text-xs font-bold ' +
          (result.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700');
      }
      const rxEl = document.getElementById('portal-prescription-note');
      if (rxEl) {
        if (result.prescriptionSummary) {
          rxEl.innerHTML = `<strong>💊 Prescribed Medications:</strong><br/>${result.prescriptionSummary}`;
          rxEl.classList.remove('hidden');
        } else {
          rxEl.classList.add('hidden');
        }
      }
    }
  }

  const container = document.getElementById('queue-status-result');
  if (!container) return;

  if (!result) {
    container.innerHTML = `
      <div class="status-card error">
        <p>❌ No booking found for that phone number or token. Please check and try again.</p>
      </div>`;
    return;
  }

  const statusLabels = {
    pending: { label: '⏳ Waiting for Confirmation', color: '#d97706' },
    confirmed: { label: '✅ Confirmed — Please Report to Reception', color: '#2563eb' },
    triage: { label: '📋 In Triage — Being Assessed by Nurse', color: '#7c3aed' },
    with_doctor: { label: '👨‍⚕️ With the Doctor', color: '#059669' },
    awaiting_payment: { label: '💰 Awaiting Payment at Cashier', color: '#ea580c' },
    completed: { label: '🎉 Visit Complete', color: '#16a34a' },
    cancelled: { label: '❌ Appointment Cancelled', color: '#dc2626' },
    in_progress: { label: '🔄 In Progress', color: '#0891b2' },
  };

  const { label, color } = statusLabels[result.status] || { label: result.status, color: '#6b7280' };

  container.innerHTML = `
    <div class="status-card">
      <div class="token-display">${result.token || '—'}</div>
      ${result.patientName ? `<p><strong>${result.patientName}</strong></p>` : ''}
      <div class="status-badge" style="background:${color};color:#fff;padding:0.5rem 1rem;border-radius:2rem;display:inline-block;margin:0.5rem 0;">
        ${label}
      </div>
      ${result.queuePosition > 0 ? `
        <p>Queue Position: <strong>#${result.queuePosition}</strong></p>
        <p>Patients ahead: <strong>${result.aheadCount}</strong></p>
        <p>Estimated wait: <strong>~${result.estimatedWaitMinutes} minutes</strong></p>` : ''}
      ${result.prescriptionSummary ? `
        <div class="prescription-preview">
          <h4>Your Treatment Plan:</h4>
          <p>${result.prescriptionSummary}</p>
        </div>` : ''}
    </div>`;
}

// ===========================================================================
// === SECTION 15: APP INITIALIZATION ========================================
// ===========================================================================

/** Register the Service Worker */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[AQ EMR] Service Worker registered:', reg.scope);
    } catch (err) {
      console.warn('[AQ EMR] Service Worker registration failed:', err);
    }
  }
}

/** Main DOMContentLoaded initialization */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AQ MedTech] Initializing clinic application…');

  // 1. Apply brand colors
  applyBrandColors();

  // 2. Register Service Worker
  await registerServiceWorker();

  // 3. Initialize Supabase client
  initSupabase();

  // 4. Initialize Dexie DB
  initDexie();

  // 5. Render public website sections
  renderHero();
  renderServices();
  renderDoctors();
  renderHMOs();
  renderDirections();
  renderFooter();

  // 6. Set up 5-tap footer shortcut to unlock admin
  setupFooterTapShortcut();

  // 7. PWA install banners
  setupIOSBanner();
  setupAndroidInstallPrompt();

  // 8. Set up hash router
  window.addEventListener('hashchange', () => Router());

  // 9. Run initial route check (handle PWA mode + hash)
  checkPwaModeOnLoad();
  Router();

  // 10. Check online status and run initial sync if online
  if (navigator.onLine) {
    state.isOnline = true;
    updateSyncPill('syncing');
    syncToSupabase().catch(() => updateSyncPill('offline'));
  } else {
    state.isOnline = false;
    updateSyncPill('offline');
  }

  // 11. Set up booking form submit handler
  const bookingForm = document.getElementById('booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', handleBookingFormSubmit);
  }

  // 12. Set up patient portal search handler
  const portalSearchInput = document.getElementById('portal-queue-search');
  if (portalSearchInput) {
    const doPortalSearch = debounce(async () => {
      const query = portalSearchInput.value.trim();
      if (!query) return;
      const result = await checkQueueStatus(query);
      renderQueueStatus(result);
    }, 400);

    portalSearchInput.addEventListener('keyup', doPortalSearch);

    const portalSearchBtn = document.getElementById('portal-search-btn');
    if (portalSearchBtn) {
      portalSearchBtn.addEventListener('click', async () => {
        const query = portalSearchInput.value.trim();
        const result = await checkQueueStatus(query);
        renderQueueStatus(result);
      });
    }
  }

  // 13. Check for 30-day chronic refill alerts
  await checkRefillsDue().catch(() => {});

  // Wire logout buttons
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', logout);
  });

  // Wire new patient form submit
  const newPatientForm = document.getElementById('new-patient-form');
  if (newPatientForm) {
    newPatientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleNewPatientForm();
    });
  }

  console.log('[AQ MedTech] Application ready. ✅');
});

// Expose key functions to global scope for inline onclick handlers
window.confirmBooking = confirmBooking;
window.selectPatientForConsultation = selectPatientForConsultation;
window.selectPatientForTriage = selectPatientForTriage;
window.selectPatient = selectPatient;
window.applyQuickChip = applyQuickChip;
window.addPrescriptionRow = addPrescriptionRow;
window.removePrescriptionRow = removePrescriptionRow;
window.completeConsultation = completeConsultation;
window.selectPaymentMethod = selectPaymentMethod;
window.selectPaymentTender = selectPaymentTender;
window.confirmPayment = confirmPayment;
window.confirmPaymentAndLock = confirmPaymentAndLock;
window.triggerWhatsAppSummary = triggerWhatsAppSummary;
window.toggleChronicPatient = toggleChronicPatient;
window.generateWhatsAppMessage = generateWhatsAppMessage;
window.markAsChronicPatient = markAsChronicPatient;
window.generateLocumLogin = generateLocumLogin;
window.exportCSV = exportCSV;
window.toggleClinicActive = toggleClinicActive;
window.startDictation = startDictation;
window.stopDictation = stopDictation;
window.logout = logout;
window.navigateToAdmin = navigateToAdmin;
window.initDirectorDashboard = initDirectorDashboard;
window.initSuperAdmin = initSuperAdmin;
window.registerNewClinic = registerNewClinic;

// Hooks connecting index.html inline delegates to app.js engine
window.handleBookingSubmit = handleBookingFormSubmit;
window.lookupPortalStatus = async (q) => {
  const result = await checkQueueStatus(q);
  renderQueueStatus(result);
};
window.appSignOut = logout;
window.handlePatientSearch = async (query) => {
  const resultsDiv = document.getElementById('patient-search-results');
  if (!resultsDiv) return;
  if (!query || query.trim().length < 2) {
    resultsDiv.classList.add('hidden');
    return;
  }
  const patients = await searchPatients(query);
  if (patients.length === 0) {
    resultsDiv.innerHTML = '<div class="p-3 text-sm text-gray-400">No patients found. Click "+ New Patient" to register.</div>';
    resultsDiv.classList.remove('hidden');
    return;
  }
  resultsDiv.innerHTML = patients.map(p => `
    <div class="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 flex justify-between items-center" onclick="selectPatientForTriage(${p.localId})">
      <div>
        <div class="font-bold text-gray-800 text-sm">${p.full_name}</div>
        <div class="text-xs text-gray-500">${p.phone} • ${p.sex || '—'} • ${p.blood_group || 'BG?'} ${p.genotype || ''}</div>
      </div>
      <span class="text-xs font-semibold text-primary-600">Select & Triage →</span>
    </div>
  `).join('');
  resultsDiv.classList.remove('hidden');
};
window.handleConfirmTriage = handleConfirmTriage;
window.handleCompleteConsultation = completeConsultation;
window.handleViewRefillList = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffStr = thirtyDaysAgo.toISOString().split('T')[0];
  const due = await db.patients
    .filter(p => p.is_chronic && (!p.last_refill_date || p.last_refill_date <= cutoffStr))
    .toArray();
  if (due.length === 0) {
    alert('No chronic patients currently overdue for refill.');
    return;
  }
  const list = due.map(p => `• ${p.full_name} (${p.phone}) — Last refill: ${p.last_refill_date || 'None on record'}`).join('\n');
  alert(`📋 Chronic/ANC Patients Due for 30-Day Refill (${due.length}):\n\n${list}`);
};
window.loadDirectorDashboard = initDirectorDashboard;
window.handleExportCSV = exportCSV;
window.handleRegisterClinic = registerNewClinic;
window.loadSuperAdminClinics = initSuperAdmin;
window.handleGenerateLocum = generateLocumLogin;
