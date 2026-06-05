/* ═══════════════════════════════════════════════════
   MST Master Dashboard — app.js
   Uses the Google Apps Script backend (GAS_URL) to proxy Airtable API
   ═══════════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Replace GAS_URL with your deployed Google Apps Script web app URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwt5QknowMzoNAFA3nEAmMTYp8vVDxp5IYO81oHjevwGs3Iy-mEaDyXSoU3-jLJ-91D/exec';

// ─── STATE ────────────────────────────────────────────────────────────────────
let selectedCity  = '';
let tripType      = 'checkin';
let allTrips      = [];
let allProperties = [];

// ─── SCREEN NAVIGATION ────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (s.id === id) {
      s.classList.remove('slide-out');
      // Force reflow
      void s.offsetWidth;
      s.classList.add('active');
    } else if (s.classList.contains('active')) {
      s.classList.remove('active');
      s.classList.add('slide-out');
      setTimeout(() => s.classList.remove('slide-out'), 400);
    }
  });
}

function selectCity(city) {
  selectedCity = city;
  document.getElementById('hub-title').textContent = city;
  document.querySelectorAll('[id$="-city-badge"]').forEach(el => el.textContent = city);
  showScreen('screen-hub');
}

function goHome() { showScreen('screen-home'); }
function goHub()  { showScreen('screen-hub'); }

function openSection(section) {
  const screenId = `screen-${
    section === 'trips'        ? 'trips'        :
    section === 'properties'   ? 'properties'   : 'availability'
  }`;
  showScreen(screenId);

  if (section === 'trips') {
    loadTrips();
  } else if (section === 'properties') {
    loadProperties();
  }
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function toISO(date) {
  return date.toISOString().split('T')[0];
}

function getDateRange() {
  const val = document.getElementById('date-filter').value;
  const today = new Date();
  today.setHours(0,0,0,0);

  if (val === 'custom') {
    return {
      from: document.getElementById('custom-from').value,
      to:   document.getElementById('custom-to').value
    };
  }

  let from = new Date(today);
  let to   = new Date(today);

  if (val === 'tomorrow') {
    from.setDate(from.getDate() + 1);
    to.setDate(to.getDate() + 1);
  } else if (val === 'today+3') {
    to.setDate(to.getDate() + 3);
  } else if (val === 'today+4') {
    to.setDate(to.getDate() + 4);
  } else if (val === 'today+5') {
    to.setDate(to.getDate() + 5);
  } else if (val === 'week') {
    to.setDate(to.getDate() + 6);
  }
  // default: today only (from === to)

  return { from: toISO(from), to: toISO(to) };
}

document.getElementById('date-filter').addEventListener('change', function() {
  const customRow = document.getElementById('custom-date-row');
  customRow.style.display = this.value === 'custom' ? 'flex' : 'none';
  applyTripsFilters();
});

function applyTripsFilters() {
  const { from, to } = getDateRange();
  const filtered = allTrips.filter(t => {
    const ci = t.fields['Arrival Date']   || '';
    const co = t.fields['Checkout Date']  || '';

    if (tripType === 'checkin')  return ci >= from && ci <= to;
    if (tripType === 'checkout') return co >= from && co <= to;
    // both
    return (ci >= from && ci <= to) || (co >= from && co <= to);
  });
  renderTrips(filtered);
}

function setTripType(type, btn) {
  tripType = type;
  document.querySelectorAll('.seg').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  applyTripsFilters();
}

// ─── AIRTABLE / GAS FETCH ─────────────────────────────────────────────────────
async function fetchFromGAS(action, params = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('city', selectedCity);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── TRIPS ────────────────────────────────────────────────────────────────────
async function loadTrips() {
  const container = document.getElementById('trips-container');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading trips…</p></div>`;

  try {
    const data = await fetchFromGAS('trips');
    allTrips = data.records || [];
    applyTripsFilters();
  } catch (e) {
    container.innerHTML = `
      <div class="error-state">
        <strong>⚠️ Could not load trips</strong><br>
        ${e.message}<br><br>
        <small>Make sure the Google Apps Script is deployed and the URL is configured.</small>
      </div>`;
  }
}

function renderTrips(trips) {
  const container = document.getElementById('trips-container');
  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No trips found for the selected filters.</p></div>`;
    return;
  }

  const { from, to } = getDateRange();
  const checkinsArr  = [];
  const checkoutsArr = [];

  trips.forEach(t => {
    const ci = t.fields['Arrival Date'];
    const co = t.fields['Checkout Date'];
    if ((tripType === 'checkin' || tripType === 'both') && ci >= from && ci <= to) {
      checkinsArr.push({ ...t, _type: 'checkin' });
    }
    if ((tripType === 'checkout' || tripType === 'both') && co >= from && co <= to) {
      checkoutsArr.push({ ...t, _type: 'checkout' });
    }
  });

  // Sort by date
  checkinsArr.sort((a,b)  => (a.fields['Arrival Date']  || '').localeCompare(b.fields['Arrival Date']  || ''));
  checkoutsArr.sort((a,b) => (a.fields['Checkout Date'] || '').localeCompare(b.fields['Checkout Date'] || ''));

  const combined = [...checkinsArr, ...checkoutsArr];
  if (tripType === 'both') {
    combined.sort((a,b) => {
      const aDate = a._type === 'checkin' ? a.fields['Arrival Date'] : a.fields['Checkout Date'];
      const bDate = b._type === 'checkin' ? b.fields['Arrival Date'] : b.fields['Checkout Date'];
      return (aDate||'').localeCompare(bDate||'');
    });
  }

  container.innerHTML = combined.map(t => tripCard(t, t._type)).join('');
}

function tripCard(t, type) {
  const f = t.fields;
  const name     = f['Trip Name'] || '—';
  const fullName = (f['Full Name (from CRM contact)'] || []).join(', ') || '—';
  const group    = f['Customer group naming'] || '—';
  const channel  = f['Channel contact'] || '—';
  const ci       = f['Arrival Date']  ? fmtDate(f['Arrival Date'])  : '—';
  const co       = f['Checkout Date'] ? fmtDate(f['Checkout Date']) : '—';
  const prop     = (f['Property (for automations)'] || '—');

  return `
    <div class="trip-card" onclick="openTripDetail('${t.id}')">
      <div class="trip-card-header">
        <div class="trip-name">${esc(name)}</div>
        <div class="trip-type-badge ${type === 'checkin' ? 'badge-checkin' : 'badge-checkout'}">
          ${type === 'checkin' ? 'Check-in' : 'Check-out'}
        </div>
      </div>
      <div class="trip-meta">
        <div class="trip-meta-item"><span class="meta-icon">👤</span>${esc(fullName)}</div>
        <div class="trip-meta-item"><span class="meta-icon">📅</span>${ci} → ${co}</div>
        <div class="trip-meta-item"><span class="meta-icon">🏠</span>${esc(prop)}</div>
        <div class="trip-meta-item"><span class="meta-icon">📱</span>${esc(channel)}</div>
      </div>
    </div>`;
}

function openTripDetail(id) {
  const t = allTrips.find(r => r.id === id);
  if (!t) return;
  const f = t.fields;

  const fullName = (f['Full Name (from CRM contact)'] || []).join(', ') || '—';
  const group    = f['Customer group naming'] || '—';
  const channel  = f['Channel contact'] || '—';
  const ci       = f['Arrival Date']  ? fmtDate(f['Arrival Date'])  : '—';
  const co       = f['Checkout Date'] ? fmtDate(f['Checkout Date']) : '—';
  const prop     = f['Property (for automations)'] || '—';
  const notes    = f['Check-in Notes'] || '—';

  document.getElementById('trip-modal-body').innerHTML = `
    <div class="modal-title">${esc(f['Trip Name'] || '—')}</div>
    <div class="detail-section">
      <div class="detail-section-title">Customer</div>
      <div class="detail-row"><div class="detail-label">Full Name</div><div class="detail-value">${esc(fullName)}</div></div>
      <div class="detail-row"><div class="detail-label">Group Name</div><div class="detail-value">${esc(group)}</div></div>
      <div class="detail-row"><div class="detail-label">Channel</div><div class="detail-value">${esc(channel)}</div></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Stay Details</div>
      <div class="detail-row"><div class="detail-label">Check-in</div><div class="detail-value">${ci}</div></div>
      <div class="detail-row"><div class="detail-label">Check-out</div><div class="detail-value">${co}</div></div>
      <div class="detail-row"><div class="detail-label">Property</div><div class="detail-value">${esc(prop)}</div></div>
    </div>
    ${notes !== '—' ? `
    <div class="detail-section">
      <div class="detail-section-title">Check-in Notes</div>
      <div class="detail-row"><div class="detail-value" style="width:100%">${esc(notes)}</div></div>
    </div>` : ''}
  `;
  document.getElementById('trip-modal').classList.add('open');
}

function closeTripModal(e) {
  if (e.target === document.getElementById('trip-modal')) closeTripModalDirect();
}
function closeTripModalDirect() {
  document.getElementById('trip-modal').classList.remove('open');
}

// ─── PROPERTIES ──────────────────────────────────────────────────────────────
async function loadProperties() {
  const container = document.getElementById('props-container');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading properties…</p></div>`;

  try {
    const data = await fetchFromGAS('properties');
    allProperties = data.records || [];
    filterProperties();
  } catch (e) {
    container.innerHTML = `
      <div class="error-state">
        <strong>⚠️ Could not load properties</strong><br>
        ${e.message}<br><br>
        <small>Make sure the Google Apps Script is deployed and configured.</small>
      </div>`;
  }
}

function filterProperties() {
  const q = (document.getElementById('prop-search').value || '').toLowerCase();
  const filtered = allProperties.filter(p => {
    const name = (p.fields['Internal listing name'] || '').toLowerCase();
    const loc  = (p.fields['Location'] || '').toLowerCase();
    return !q || name.includes(q) || loc.includes(q);
  });
  renderProperties(filtered);
}

function renderProperties(props) {
  const container = document.getElementById('props-container');
  if (!props.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏠</div><p>No properties found.</p></div>`;
    return;
  }
  container.innerHTML = props.map(p => propCard(p)).join('');
}

function propCard(p) {
  const f     = p.fields;
  const name  = f['Internal listing name'] || '—';
  const floor = f['Floor'] != null ? `Floor ${f['Floor']}` : '';
  const view  = Array.isArray(f['View type']) ? f['View type'].join(', ') : (f['View type'] || '');
  const loc   = f['Location'] || '';
  const beds  = f['Number of bedrooms'] != null ? `${f['Number of bedrooms']} bed` : '';
  const baths = f['Number of bathrooms'] != null ? `${f['Number of bathrooms']} bath` : '';
  const size  = f['(m2) Property Size'] ? `${f['(m2) Property Size']} m²` : '';
  const tier  = f['Standard/Deluxe/Premium'] || '';

  const tierClass = tier === 'Premium' ? 'tier-premium' : tier === 'Deluxe' ? 'tier-deluxe' : 'tier-standard';

  return `
    <div class="prop-card" onclick="openPropDetail('${p.id}')">
      <div class="prop-card-header">
        <div class="prop-name">${esc(name)}</div>
        ${tier ? `<div class="prop-tier-badge ${tierClass}">${esc(tier)}</div>` : ''}
      </div>
      <div class="prop-meta">
        ${loc ? `<div class="prop-meta-item"><span>📍</span>${esc(loc)}</div>` : ''}
        ${floor ? `<div class="prop-meta-item"><span>🏢</span>${floor}</div>` : ''}
        ${view ? `<div class="prop-meta-item"><span>🌅</span>${esc(view)}</div>` : ''}
        ${beds ? `<div class="prop-meta-item"><span>🛏️</span>${beds}</div>` : ''}
        ${baths ? `<div class="prop-meta-item"><span>🚿</span>${baths}</div>` : ''}
        ${size ? `<div class="prop-meta-item"><span>📐</span>${size}</div>` : ''}
      </div>
    </div>`;
}

function openPropDetail(id) {
  const p = allProperties.find(r => r.id === id);
  if (!p) return;
  const f = p.fields;

  const msLink     = f['Monthstayz website link']  || '';
  const abnbLink   = f['Airbnb preview link']       || '';
  const driveLink  = f['Google drive photos link']  || '';
  const passcode   = f['Passcode']                  || '—';
  const keys       = f['Where would be the keys?']  || '—';
  const view       = Array.isArray(f['View type'])  ? f['View type'].join(', ') : (f['View type'] || '—');
  const region     = f['Region (North or South)']   || '—';

  document.getElementById('prop-modal-body').innerHTML = `
    <div class="modal-title">${esc(f['Internal listing name'] || '—')}</div>

    <div class="detail-section">
      <div class="detail-section-title">Property Details</div>
      <div class="detail-row"><div class="detail-label">Floor</div><div class="detail-value">${f['Floor'] != null ? f['Floor'] : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">View Type</div><div class="detail-value">${esc(view)}</div></div>
      <div class="detail-row"><div class="detail-label">Location</div><div class="detail-value">${esc(f['Location'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Region</div><div class="detail-value">${esc(region)}</div></div>
      <div class="detail-row"><div class="detail-label">Size</div><div class="detail-value">${f['(m2) Property Size'] ? f['(m2) Property Size'] + ' m²' : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Tier</div><div class="detail-value">${esc(f['Standard/Deluxe/Premium'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Bedrooms</div><div class="detail-value">${f['Number of bedrooms'] != null ? f['Number of bedrooms'] : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Bathrooms</div><div class="detail-value">${f['Number of bathrooms'] != null ? f['Number of bathrooms'] : '—'}</div></div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Access</div>
      <div class="detail-row"><div class="detail-label">Passcode</div><div class="detail-value">${esc(passcode)}</div></div>
      <div class="detail-row"><div class="detail-label">Keys Location</div><div class="detail-value">${esc(keys)}</div></div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Links</div>
      ${driveLink ? `<div class="detail-row"><div class="detail-label">📁 Photos</div><div class="detail-value"><a href="${esc(driveLink)}" target="_blank">View Drive Folder ↗</a></div></div>` : ''}
      ${msLink    ? `<div class="detail-row"><div class="detail-label">🌐 Monthstayz</div><div class="detail-value"><a href="${esc(msLink)}" target="_blank">View Listing ↗</a></div></div>` : ''}
      ${abnbLink  ? `<div class="detail-row"><div class="detail-label">🏠 Airbnb</div><div class="detail-value"><a href="${esc(abnbLink)}" target="_blank">View Preview ↗</a></div></div>` : ''}
    </div>
  `;

  document.getElementById('prop-modal').classList.add('open');
}

function closePropModal(e) {
  if (e.target === document.getElementById('prop-modal')) closePropModalDirect();
}
function closePropModalDirect() {
  document.getElementById('prop-modal').classList.remove('open');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch { return iso; }
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── PWA SERVICE WORKER REGISTRATION ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.warn);
}
