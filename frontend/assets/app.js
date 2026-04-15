/* ═══════════════════════════════════════════
   JanAI Smart City Platform — App Logic v2.0
   Gemini AI + OpenStreetMap + OSRM Routing
   ═══════════════════════════════════════════ */

// ─── Map Initialization ───────────────────────────────────────────
let map, layerGroup, routeLine;

function initMap() {
  map = L.map('map-view', {
    center: [20.5937, 78.9629], // Center of India
    zoom: 5,
    zoomControl: true,
    attributionControl: true
  });

  // Dark-style tile layer from CartoDB
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);
  setMapStatus('Ready — India Overview');
}

function clearMap() {
  if (layerGroup) layerGroup.clearLayers();
  if (routeLine && map.hasLayer(routeLine)) map.removeLayer(routeLine);
}

function setMapStatus(text) {
  const el = document.getElementById('map-status');
  if (el) el.textContent = text;
}

// Colored circle marker custom icons
function createColorMarker(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.6);
      box-shadow:0 0 8px ${color}60;
    "></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
}

// ─── Tab Navigation ───────────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (map) setTimeout(() => map.invalidateSize(), 100);
  });
});

// Module cards also trigger tab switch
document.querySelectorAll('.module-card[data-tab]').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.tab;
    tabBtns.forEach(b => { if (b.dataset.tab === target) b.click(); });
    document.getElementById('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ─── Helper: Show/hide loading overlay ───────────────────────────
function showLoading() { document.getElementById('ai-loading').style.display = 'flex'; }
function hideLoading() { document.getElementById('ai-loading').style.display = 'none'; }

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// ─── Generic API caller ───────────────────────────────────────────
async function callApi(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postForm(url, form, renderer) {
  showLoading();
  clearMap();
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.budget) payload.budget = Number(payload.budget);
  try {
    const data = await callApi(url, 'POST', payload);
    renderer(data, payload);
    showMapLegend();
  } catch (err) {
    console.error(err);
  } finally {
    hideLoading();
  }
}

function showMapLegend() {
  const leg = document.getElementById('map-legend');
  if (leg) leg.style.display = 'flex';
}

// ─── MODULE 1: Education ──────────────────────────────────────────
function renderEducation(data, payload) {
  const el = document.getElementById('education-results');
  if (!data.results?.length) {
    el.innerHTML = `<div class="result-card"><p class="result-body">${escapeHtml(data.message)}</p></div>`;
    return;
  }

  el.innerHTML = `<p class="result-body">${escapeHtml(data.message)}</p>` +
    data.results.map((c, i) => `
      <div class="result-card">
        <div class="result-topline">
          <div class="result-left">
            <h4>${escapeHtml(c.name)}</h4>
            <p class="result-body" style="margin-top:2px;">${escapeHtml(c.city)} • ${escapeHtml(c.type || 'Institution')}</p>
          </div>
          <div class="score-badge score-green">
            ${escapeHtml(c.match_score ?? '--')}<small>Score</small>
          </div>
        </div>
        <div class="tag-row">
          ${(c.courses || []).map(course => `<span class="tag tag-gray">${escapeHtml(course)}</span>`).join('')}
        </div>
        <div class="info-row">
          <span class="info-item">💰 <strong>INR ${Number(c.annual_fees_inr).toLocaleString('en-IN')}</strong></span>
          <span class="info-item">📍 <strong>${escapeHtml(c.distance_km)} km</strong></span>
          <span class="info-item">⭐ <strong>${escapeHtml(c.student_rating)}/5</strong></span>
        </div>
        <div class="helpline-box" style="margin-top:12px;">
          <p>🏅 Scholarship Available</p>
          <div class="phones"><span class="phone-tag">${escapeHtml(c.scholarship)}</span></div>
        </div>
        <p class="result-body">${escapeHtml(c.explanation)}</p>
      </div>
    `).join('');

  // Plot markers
  const colors = ['#10b981', '#3b82f6', '#f59e0b'];
  data.results.forEach((c, i) => {
    const coords = c.coordinates;
    if (coords && coords.length === 2) {
      L.marker(coords, { icon: createColorMarker(colors[i]) })
        .addTo(layerGroup)
        .bindPopup(`<b>${escapeHtml(c.name)}</b><br>Score: ${c.match_score}`);
    }
  });
  if (data.results[0]?.coordinates) map.flyTo(data.results[0].coordinates, 11, { duration: 1.5 });
  setMapStatus(`Education map: ${data.results.length} colleges plotted`);
}

document.getElementById('education-form').addEventListener('submit', e => {
  e.preventDefault();
  postForm('/api/education/recommend', e.currentTarget, renderEducation);
});

// ─── MODULE 2: Healthcare ─────────────────────────────────────────
function renderHealthcare(data, payload) {
  const el = document.getElementById('healthcare-results');
  const sev = (data.severity || 'low').toLowerCase();
  const sevClass = { critical: 'severity-critical', medium: 'severity-medium', low: 'severity-low' }[sev] || 'severity-low';

  el.innerHTML = `
    <div class="severity-banner ${sevClass}">
      ⚠️ Severity: ${(data.severity || 'low').toUpperCase()} — ${escapeHtml(data.symptoms_analysis || data.message)}
    </div>
    ${data.message !== data.symptoms_analysis ? `<p class="result-body">${escapeHtml(data.message)}</p>` : ''}
  ` + (data.results || []).map(h => `
    <div class="result-card">
      <div class="result-topline">
        <div class="result-left">
          <h4>${escapeHtml(h.name)}</h4>
          <p class="result-body" style="margin-top:2px">${escapeHtml(h.city)}</p>
        </div>
        <div class="score-badge ${sev === 'critical' ? 'score-red' : 'score-blue'}">
          ${escapeHtml(h.recommendation_score ?? '--')}<small>Rank</small>
        </div>
      </div>
      <div class="tag-row">
        ${h.emergency_available ? '<span class="tag tag-red">🚨 Emergency</span>' : '<span class="tag tag-gray">No Emergency</span>'}
        ${(h.specialties || []).map(s => `<span class="tag tag-blue">${escapeHtml(s)}</span>`).join('')}
      </div>
      <div class="info-row">
        <span class="info-item">📍 <strong>${escapeHtml(h.distance_km)} km away</strong></span>
        <span class="info-item">⭐ <strong>${escapeHtml(h.rating)}/5</strong></span>
        ${h.phone ? `<span class="info-item">📞 <strong>${escapeHtml(h.phone)}</strong></span>` : ''}
      </div>
      <p class="result-body">${escapeHtml(h.why_recommended)}</p>
    </div>
  `).join('');

  const colors = ['#ef4444', '#f87171', '#fca5a5'];
  (data.results || []).forEach((h, i) => {
    if (h.coordinates?.length === 2) {
      L.marker(h.coordinates, { icon: createColorMarker(colors[i]) })
        .addTo(layerGroup)
        .bindPopup(`<b>${escapeHtml(h.name)}</b><br>Rating: ${h.rating} ⭐`);
    }
  });
  if (data.results?.[0]?.coordinates) map.flyTo(data.results[0].coordinates, 12, { duration: 1.5 });
  setMapStatus(`Healthcare: ${data.results?.length || 0} hospitals plotted`);
}

document.getElementById('healthcare-form').addEventListener('submit', e => {
  e.preventDefault();
  postForm('/api/healthcare/recommend', e.currentTarget, renderHealthcare);
});

// ─── MODULE 3: Safety Routing ─────────────────────────────────────
async function renderSafety(data, payload) {
  const el = document.getElementById('safety-results');
  const route = data.recommended_route;
  if (!route) {
    el.innerHTML = `<div class="result-card"><p class="result-body">${escapeHtml(data.message)}</p></div>`;
    return;
  }

  el.innerHTML = `
    <p class="result-body">${escapeHtml(data.message)}</p>
    <div class="result-card">
      <div class="result-topline">
        <div class="result-left">
          <h4>🛡️ ${escapeHtml(route.name)}</h4>
          <p class="result-body" style="margin-top:2px">${escapeHtml(route.source)} → ${escapeHtml(route.destination)}</p>
        </div>
        <div class="score-badge score-green">${escapeHtml(route.risk_score)}<small>Risk</small></div>
      </div>
      <div class="tag-row">
        <span class="tag tag-green">✅ Recommended</span>
        <span class="tag tag-blue">${escapeHtml(route.road_type || 'Road')}</span>
        <span class="tag tag-amber">${escapeHtml(route.estimated_time_min || '--')} min</span>
      </div>
      <div class="info-row">
        <span class="info-item">📏 <strong>${escapeHtml(route.distance_km)} km</strong></span>
        <span class="info-item">💡 Lighting <strong>${escapeHtml(route.lighting_score)}/10</strong></span>
        <span class="info-item">👥 Crowd <strong>${escapeHtml(route.crowd_density_score)}/10</strong></span>
      </div>
      <p class="result-body">${escapeHtml(route.ai_explanation)}</p>
    </div>
    ${(data.alternatives || []).map(alt => `
      <div class="result-card" style="opacity:0.7">
        <h4 style="color:var(--muted)">${escapeHtml(alt.name)} <span class="tag tag-amber" style="font-size:0.75rem;vertical-align:middle">Alt</span></h4>
        <p class="result-body">Risk Score: ${escapeHtml(alt.risk_score)} — ${escapeHtml(alt.reason_avoided)}</p>
      </div>
    `).join('')}
  `;

  // Draw route using OSRM if waypoints available
  if (route.waypoints?.length >= 2) {
    try {
      const wps = route.waypoints;
      const coordStr = wps.map(w => `${w[1]},${w[0]}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
      const osrm = await fetch(osrmUrl).then(r => r.json());
      if (osrm.routes?.[0]) {
        routeLine = L.geoJSON(osrm.routes[0].geometry, {
          style: { color: '#10b981', weight: 5, opacity: 0.85, dashArray: null }
        }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
        setMapStatus('OSRM route drawn on map');
      }
    } catch(e) {
      // Still show start/end markers
      const first = route.waypoints[0];
      const last = route.waypoints[route.waypoints.length - 1];
      L.marker(first, { icon: createColorMarker('#10b981') }).addTo(layerGroup).bindPopup('Start');
      L.marker(last, { icon: createColorMarker('#3b82f6') }).addTo(layerGroup).bindPopup('Destination');
      map.fitBounds([first, last], { padding: [80, 80] });
      setMapStatus('Showing route markers');
    }
  } else {
    setMapStatus('Route drawn — no waypoints available');
  }
}

document.getElementById('safety-form').addEventListener('submit', e => {
  e.preventDefault();
  showLoading();
  clearMap();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  callApi('/api/safety/route', 'POST', payload)
    .then(data => renderSafety(data, payload))
    .finally(hideLoading);
});

// ─── MODULE 4: Crime Reporting ────────────────────────────────────
function renderCrime(data) {
  const el = document.getElementById('crime-results');
  if (data.error) {
    el.innerHTML = `<div class="result-card"><p class="result-body" style="color:var(--red)">${escapeHtml(data.error)}</p></div>`;
    return;
  }

  const isUrgent = data.urgent || data.severity === 'critical' || data.severity === 'high';
  const sevClass = { critical: 'severity-critical', high: 'severity-critical', medium: 'severity-medium', low: 'severity-low' }[data.severity] || 'severity-medium';

  el.innerHTML = `
    <div class="result-card">
      <div class="tag-row">
        <span class="tag tag-blue">📋 ${escapeHtml(data.tracking_id)}</span>
        <span class="tag ${isUrgent ? 'tag-red' : 'tag-amber'}">${escapeHtml((data.category || '').toUpperCase())}</span>
        <span class="tag tag-gray">${escapeHtml((data.severity || '').toUpperCase())}</span>
      </div>
      <div class="severity-banner ${sevClass}" style="margin-top:12px">
        ${isUrgent ? '🚨' : 'ℹ️'} ${escapeHtml(data.message)}
      </div>
      ${data.recommended_authority ? `<p class="result-body">📞 Contact: <strong>${escapeHtml(data.recommended_authority)}</strong></p>` : ''}
      ${data.legal_section ? `<p class="result-body" style="margin-top:4px">⚖️ Legal Reference: <strong>${escapeHtml(data.legal_section)}</strong></p>` : ''}
    </div>

    ${(data.helpline_numbers?.length) ? `
    <div class="helpline-box result-card" style="background:rgba(16,185,129,0.06)">
      <p>📞 Emergency Helplines</p>
      <div class="phones">${(data.helpline_numbers || []).map(n => `<span class="phone-tag">${escapeHtml(n)}</span>`).join('')}</div>
    </div>
    ` : ''}

    ${(data.immediate_steps?.length) ? `
    <div class="result-card">
      <h4>Immediate Steps</h4>
      <ul class="steps-list">
        ${(data.immediate_steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
  `;

  // Plot incident on map if coordinates available
  const coords = data.coordinates;
  if (coords?.length === 2) {
    L.marker(coords, { icon: createColorMarker('#ef4444') })
      .addTo(layerGroup)
      .bindPopup(`<b>Incident Filed: ${escapeHtml(data.tracking_id)}</b><br>${escapeHtml(data.category)}`);
    map.flyTo(coords, 13, { duration: 1.5 });
    setMapStatus('Incident plotted on map');
  }
  showMapLegend();
}

document.getElementById('crime-form').addEventListener('submit', e => {
  e.preventDefault();
  showLoading();
  clearMap();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  callApi('/api/crime/report', 'POST', payload)
    .then(renderCrime)
    .finally(hideLoading);
});

// ─── MODULE 5: Fraud Scanner ──────────────────────────────────────
function renderFraud(data) {
  const el = document.getElementById('fraud-results');
  if (data.error) {
    el.innerHTML = `<div class="result-card"><p class="result-body" style="color:var(--red)">${escapeHtml(data.error)}</p></div>`;
    return;
  }

  const risk = Number(data.risk_score) || 0;
  const isScam = data.classification === 'scam';
  const isSuspicious = data.classification === 'suspicious';
  const barColor = isScam ? '#ef4444' : isSuspicious ? '#f59e0b' : '#10b981';
  const scoreCls = isScam ? 'score-red' : isSuspicious ? 'score-amber' : 'score-green';

  el.innerHTML = `
    <div class="result-card">
      <div class="result-topline">
        <div class="result-left">
          <h4>${isScam ? '🚨 SCAM DETECTED' : isSuspicious ? '⚠️ SUSPICIOUS' : '✅ Appears Safe'}</h4>
          <p class="result-body">${escapeHtml(data.fraud_type || data.classification)}</p>
        </div>
        <div class="score-badge ${scoreCls}">${risk}<small>Risk</small></div>
      </div>
      <div class="risk-meter-wrap">
        <div class="risk-meter-label">
          <span style="font-size:0.8rem;color:var(--muted)">Safe (0)</span>
          <span style="font-size:0.8rem;font-weight:700;color:${barColor}">${risk}/100 Risk Score</span>
          <span style="font-size:0.8rem;color:var(--muted)">Scam (100)</span>
        </div>
        <div class="risk-meter-bar">
          <div class="risk-meter-fill" style="width:${risk}%;background:${barColor}"></div>
        </div>
      </div>
      <p class="result-body">${escapeHtml(data.analysis)}</p>
    </div>

    ${(data.red_flags?.length) ? `
    <div class="result-card">
      <h4>🚩 Red Flags Identified</h4>
      <div class="tag-row" style="margin-top:10px">
        ${data.red_flags.map(f => `<span class="tag tag-red">${escapeHtml(f)}</span>`).join('')}
      </div>
    </div>
    ` : ''}

    ${(data.what_to_do?.length) ? `
    <div class="result-card">
      <h4>✅ What To Do Right Now</h4>
      <ul class="steps-list">
        ${data.what_to_do.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${data.real_contact ? `
    <div class="helpline-box">
      <p>📞 Real Organisation Contact</p>
      <div class="phones"><span class="phone-tag">${escapeHtml(data.real_contact)}</span></div>
    </div>
    ` : ''}
  `;
}

document.getElementById('fraud-form').addEventListener('submit', e => {
  e.preventDefault();
  showLoading();
  const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
  callApi('/api/fraud/check', 'POST', payload)
    .then(renderFraud)
    .finally(hideLoading);
});

// ─── MODULE 6: Safe City Analytics ───────────────────────────────
async function renderAnalytics() {
  showLoading();
  clearMap();
  const city = document.getElementById('analytics-city').value;
  const el = document.getElementById('analytics-results');
  el.innerHTML = '';

  try {
    const data = await callApi(`/api/analytics/crimes?city=${encodeURIComponent(city)}`);

    el.innerHTML = `
      <div class="analytics-summary-grid">
        <div class="a-stat"><strong>${escapeHtml(data.total_incidents_today ?? data.incidents?.length ?? '--')}</strong><span>Incidents Today</span></div>
        <div class="a-stat"><strong style="color:#3b82f6">${(data.safe_zones || []).length}</strong><span>Safe Zones Identified</span></div>
      </div>
      <div class="result-card"><p class="result-body">${escapeHtml(data.summary)}</p></div>

      ${(data.safe_zones?.length) ? `
      <div class="result-card">
        <h4>✅ Safe Zones</h4>
        <div class="tag-row">${data.safe_zones.map(z => `<span class="tag tag-green">${escapeHtml(z)}</span>`).join('')}</div>
      </div>` : ''}

      ${(data.hotspot_zones?.length) ? `
      <div class="result-card">
        <h4>🔴 High-Risk Hotspots</h4>
        <div class="tag-row">${data.hotspot_zones.map(z => `<span class="tag tag-red">${escapeHtml(z)}</span>`).join('')}</div>
      </div>` : ''}

      ${(data.safety_tips?.length) ? `
      <div class="result-card">
        <h4>💡 City Safety Tips</h4>
        <ul class="steps-list">${data.safety_tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>` : ''}
    `;

    // Plot all incidents
    const typeColors = { theft: '#f59e0b', harassment: '#ec4899', fraud: '#8b5cf6', accident: '#ef4444' };
    (data.incidents || []).forEach(incident => {
      const coords = incident.location;
      if (coords?.length === 2) {
        const color = typeColors[incident.type] || '#94a3b8';
        L.circleMarker(coords, { radius: 10, color, fillColor: color, fillOpacity: 0.65, weight: 2 })
          .addTo(layerGroup)
          .bindPopup(`<b>${escapeHtml(incident.area_name || incident.type)}</b><br>${escapeHtml(incident.description)}`);
      }
    });

    // Fly to city
    if (data.incidents?.[0]?.location) {
      map.flyTo(data.incidents[0].location, 11, { duration: 2 });
    }
    setMapStatus(`${escapeHtml(city)}: ${data.incidents?.length || 0} incidents mapped`);
    showMapLegend();
  } catch(err) {
    el.innerHTML = `<div class="result-card"><p class="result-body" style="color:var(--red)">Analytics failed. Is the backend running?</p></div>`;
  } finally {
    hideLoading();
  }
}

document.getElementById('load-analytics-btn').addEventListener('click', renderAnalytics);

// ─── Init ──────────────────────────────────────────────────────────
window.addEventListener('load', initMap);
