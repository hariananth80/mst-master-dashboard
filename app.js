/* ═══════════════════════════════════════════════════
   MST Master Dashboard — app.js
   ═══════════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
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
    section === 'trips'      ? 'trips'      :
    section === 'properties' ? 'properties' : 'availability'
  }`;
  showScreen(screenId);
  if (section === 'trips')      loadTrips();
  if (section === 'properties') loadProperties();
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function toISO(date) {
  // Use local date parts to avoid timezone shifting
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTargetDate() {
  const val = document.getElementById('date-filter').value;

  if (val === 'custom') {
    return {
      from: document.getElementById('custom-from').value,
      to:   document.getElementById('custom-to').value,
      isRange: true
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (val === 'week') {
    const end = new Date(today);
    end.setDate(today.getDate() + 6);
    return { from: toISO(today), to: toISO(end), isRange: true };
  }

  // All other options = single specific day
  const target = new Date(today);
  if      (val === 'tomorrow') target.setDate(today.getDate() + 1);
  else if (val === 'today+2')  target.setDate(today.getDate() + 2);
  else if (val === 'today+3')  target.setDate(today.getDate() + 3);
  else if (val === 'today+4')  target.setDate(today.getDate() + 4);
  else if (val === 'today+5')  target.setDate(today.getDate() + 5);
  // else val === 'today' → target stays as today

  const iso = toISO(target);
  return { from: iso, to: iso, isRange: false };
}

document.getElementById('date-filter').addEventListener('change', function () {
  document.getElementById('custom-date-row').style.display =
    this.value === 'custom' ? 'flex' : 'none';
  applyTripsFilters();
});

// ─── CITY FILTER HELPER ───────────────────────────────────────────────────────
// The 'City' field on Master Trips is a lookup — it comes back as an array
// e.g. ["Pattaya"] or ["Phuket"]. We check if selectedCity appears in it.
function tripMatchesCity(t) {
  if (!selectedCity) return true;
  const cityVal = t.fields['City'];
  if (!cityVal) return false;
  if (Array.isArray(cityVal)) {
    return cityVal.some(c => c === selectedCity);
  }
  return String(cityVal) === selectedCity;
}

// ─── TRIPS FILTER & RENDER ────────────────────────────────────────────────────
function applyTripsFilters() {
  const { from, to } = getTargetDate();

  const filtered = allTrips.filter(t => {
    // First: city filter
    if (!tripMatchesCity(t)) return false;

    const ci = t.fields['Arrival Date']  || '';
    const co = t.fields['Checkout Date'] || '';

    // Then: date filter — exact day match (from === to) or range
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

// ─── GAS FETCH ────────────────────────────────────────────────────────────────
async function fetchFromGAS(action) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('city', selectedCity);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
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
        <strong>⚠️ Could not load trips</strong><br>${e.message}<br><br>
        <small>Check the Google Apps Script is deployed and URL is set in app.js.</small>
      </div>`;
  }
}

function renderTrips(trips) {
  const container = document.getElementById('trips-container');
  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No trips found for the selected filters.</p></div>`;
    return;
  }

  const { from, to } = getTargetDate();

  // Split into check-ins and check-outs for "both" mode
  const checkins  = [];
  const checkouts = [];

  trips.forEach(t => {
    const ci = t.fields['Arrival Date']  || '';
    const co = t.fields['Checkout Date'] || '';
    const addedAsCheckin  = (tripType === 'checkin'  || tripType === 'both') && ci >= from && ci <= to;
    const addedAsCheckout = (tripType === 'checkout' || tripType === 'both') && co >= from && co <= to;
    if (addedAsCheckin)  checkins.push({ ...t, _type: 'checkin' });
    if (addedAsCheckout) checkouts.push({ ...t, _type: 'checkout' });
  });

  checkins.sort( (a,b) => (a.fields['Arrival Date']  ||'').localeCompare(b.fields['Arrival Date']  ||''));
  checkouts.sort((a,b) => (a.fields['Checkout Date'] ||'').localeCompare(b.fields['Checkout Date'] ||''));

  let html = '';

  if (tripType === 'both') {
    if (checkins.length)  html += `<div class="section-header">✅ Check-ins (${checkins.length})</div>`  + checkins.map(t => tripCard(t)).join('');
    if (checkouts.length) html += `<div class="section-header">🚪 Check-outs (${checkouts.length})</div>` + checkouts.map(t => tripCard(t)).join('');
  } else if (tripType === 'checkin') {
    html = checkins.map(t => tripCard(t)).join('');
  } else {
    html = checkouts.map(t => tripCard(t)).join('');
  }

  container.innerHTML = html;
}

function tripCard(t) {
  const f        = t.fields;
  const name     = f['Trip Name'] || '—';
  const fullName = Array.isArray(f['Full Name (from CRM contact)'])
    ? f['Full Name (from CRM contact)'].join(', ')
    : (f['Full Name (from CRM contact)'] || '—');
  const channel  = f['Channel contact'] || '—';
  const ci       = f['Arrival Date']  ? fmtDate(f['Arrival Date'])  : '—';
  const co       = f['Checkout Date'] ? fmtDate(f['Checkout Date']) : '—';
  const prop     = f['Property (for automations)'] || '—';
  const type     = t._type;

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
  const fullName = Array.isArray(f['Full Name (from CRM contact)'])
    ? f['Full Name (from CRM contact)'].join(', ')
    : (f['Full Name (from CRM contact)'] || '—');
  const ci    = f['Arrival Date']  ? fmtDate(f['Arrival Date'])  : '—';
  const co    = f['Checkout Date'] ? fmtDate(f['Checkout Date']) : '—';
  const notes = f['Check-in Notes'] || '';

  document.getElementById('trip-modal-body').innerHTML = `
    <div class="modal-title">${esc(f['Trip Name'] || '—')}</div>
    <div class="detail-section">
      <div class="detail-section-title">Customer</div>
      <div class="detail-row"><div class="detail-label">Full Name</div><div class="detail-value">${esc(fullName)}</div></div>
      <div class="detail-row"><div class="detail-label">Group Name</div><div class="detail-value">${esc(f['Customer group naming'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Channel</div><div class="detail-value">${esc(f['Channel contact'] || '—')}</div></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Stay Details</div>
      <div class="detail-row"><div class="detail-label">Check-in</div><div class="detail-value">${ci}</div></div>
      <div class="detail-row"><div class="detail-label">Check-out</div><div class="detail-value">${co}</div></div>
      <div class="detail-row"><div class="detail-label">Property</div><div class="detail-value">${esc(f['Property (for automations)'] || '—')}</div></div>
    </div>
    ${notes ? `
    <div class="detail-section">
      <div class="detail-section-title">Check-in Notes</div>
      <div class="detail-row"><div class="detail-value" style="width:100%">${esc(notes)}</div></div>
    </div>` : ''}
  `;
  document.getElementById('trip-modal').classList.add('open');
}

function closeTripModal(e)  { if (e.target === document.getElementById('trip-modal')) closeTripModalDirect(); }
function closeTripModalDirect() { document.getElementById('trip-modal').classList.remove('open'); }

// ─── PROPERTIES ───────────────────────────────────────────────────────────────
async function loadProperties() {
  const container = document.getElementById('props-container');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading properties…</p></div>`;
  try {
    const data = await fetchFromGAS('properties');
    // Properties city filter is handled in GAS (single select field), but double-check here
    allProperties = (data.records || []).filter(p => {
      if (!selectedCity) return true;
      const c = p.fields['City'];
      if (Array.isArray(c)) return c.some(v => v === selectedCity);
      return c === selectedCity;
    });
    filterProperties();
  } catch (e) {
    container.innerHTML = `
      <div class="error-state">
        <strong>⚠️ Could not load properties</strong><br>${e.message}
      </div>`;
  }
}

function filterProperties() {
  const q = (document.getElementById('prop-search').value || '').toLowerCase();
  const filtered = allProperties.filter(p => {
    if (!q) return true;
    const name = (p.fields['Internal listing name'] || '').toLowerCase();
    const loc  = (p.fields['Location'] || '').toLowerCase();
    return name.includes(q) || loc.includes(q);
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
  const beds  = f['Number of bedrooms']  != null ? `${f['Number of bedrooms']} bed`  : '';
  const baths = f['Number of bathrooms'] != null ? `${f['Number of bathrooms']} bath` : '';
  const size  = f['(m2) Property Size']  ? `${f['(m2) Property Size']} m²` : '';
  const tier  = f['Standard/Deluxe/Premium'] || '';
  const tierClass = tier === 'Premium' ? 'tier-premium' : tier === 'Deluxe' ? 'tier-deluxe' : 'tier-standard';

  return `
    <div class="prop-card" onclick="openPropDetail('${p.id}')">
      <div class="prop-card-header">
        <div class="prop-name">${esc(name)}</div>
        ${tier ? `<div class="prop-tier-badge ${tierClass}">${esc(tier)}</div>` : ''}
      </div>
      <div class="prop-meta">
        ${loc   ? `<div class="prop-meta-item"><span>📍</span>${esc(loc)}</div>`   : ''}
        ${floor ? `<div class="prop-meta-item"><span>🏢</span>${floor}</div>`      : ''}
        ${view  ? `<div class="prop-meta-item"><span>🌅</span>${esc(view)}</div>`  : ''}
        ${beds  ? `<div class="prop-meta-item"><span>🛏️</span>${beds}</div>`      : ''}
        ${baths ? `<div class="prop-meta-item"><span>🚿</span>${baths}</div>`     : ''}
        ${size  ? `<div class="prop-meta-item"><span>📐</span>${size}</div>`       : ''}
      </div>
    </div>`;
}

function openPropDetail(id) {
  const p = allProperties.find(r => r.id === id);
  if (!p) return;
  const f = p.fields;
  const view     = Array.isArray(f['View type']) ? f['View type'].join(', ') : (f['View type'] || '—');
  const msLink   = f['Monthstayz website link'] || '';
  const abnbLink = f['Airbnb preview link']     || '';
  const driveLink= f['Picture Drive Link']|| '';

  document.getElementById('prop-modal-body').innerHTML = `
    <div class="modal-title">${esc(f['Internal listing name'] || '—')}</div>
    <div class="detail-section">
      <div class="detail-section-title">Property Details</div>
      <div class="detail-row"><div class="detail-label">Floor</div><div class="detail-value">${f['Floor'] != null ? f['Floor'] : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">View Type</div><div class="detail-value">${esc(view)}</div></div>
      <div class="detail-row"><div class="detail-label">Location</div><div class="detail-value">${esc(f['Location'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Region</div><div class="detail-value">${esc(f['Region (North or South)'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Size</div><div class="detail-value">${f['(m2) Property Size'] ? f['(m2) Property Size'] + ' m²' : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Tier</div><div class="detail-value">${esc(f['Standard/Deluxe/Premium'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Bedrooms</div><div class="detail-value">${f['Number of bedrooms']  != null ? f['Number of bedrooms']  : '—'}</div></div>
      <div class="detail-row"><div class="detail-label">Bathrooms</div><div class="detail-value">${f['Number of bathrooms'] != null ? f['Number of bathrooms'] : '—'}</div></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Access</div>
      <div class="detail-row"><div class="detail-label">Passcode</div><div class="detail-value">${esc(f['Passcode'] || '—')}</div></div>
      <div class="detail-row"><div class="detail-label">Keys Location</div><div class="detail-value">${esc(f['Where would be the keys?'] || '—')}</div></div>
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

function closePropModal(e)  { if (e.target === document.getElementById('prop-modal')) closePropModalDirect(); }
function closePropModalDirect() { document.getElementById('prop-modal').classList.remove('open'); }

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; }
  catch { return iso; }
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── PWA ──────────────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.warn);
}
