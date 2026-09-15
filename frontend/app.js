const API = '';

// ========== Tabs ==========
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'ritardi') loadRitardi();
    if (btn.dataset.tab === 'coppie') loadCoppie();
    if (btn.dataset.tab === 'archivio') loadArchivio();
    if (btn.dataset.tab === 'impostazioni') loadImpostazioni();
    if (btn.dataset.tab === 'diagnostica') loadDiagnostica();
  });
});

// ========== Helpers ==========
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ========== HOME ==========
async function loadStato() {
  try {
    const s = await api('/api/stato');

    const led = document.getElementById('stato-led');
    if (s.stato === 'ok' || s.stato === 'nessuna_nuova') {
      led.className = 'led ok';
      led.textContent = s.stato === 'ok'
        ? '🟢 Aggiornamento funzionante'
        : '🟢 Connesso · Nessuna nuova estrazione';
    } else if (s.stato === 'errore') {
      led.className = 'led errore';
      led.textContent = '🔴 Aggiornamento non riuscito';
    } else {
      led.className = 'led';
      led.textContent = '⚪ Stato sconosciuto';
    }

    document.getElementById('ultimo-successo').textContent = fmtDate(s.ultimo_successo);
    document.getElementById('ultimo-tentativo').textContent = fmtDate(s.ultimo_tentativo);
    document.getElementById('totale-estrazioni').textContent = s.totale_estrazioni || 0;
    document.getElementById('numeri-allerta').textContent = s.numeri_sopra_soglia || 0;
    document.getElementById('coppie-allerta').textContent = s.coppie_sopra_soglia || 0;

    if (s.ultima_estrazione) {
      const u = s.ultima_estrazione;
      document.getElementById('ultima-estrazione').textContent = `${u.data} ${u.ora}`;
      const grid = document.getElementById('numeri-ultima');
      grid.innerHTML = u.numeri.map(n => `<span class="num">${n}</span>`).join('');
    } else {
      document.getElementById('ultima-estrazione').textContent = 'Nessuna ancora';
      document.getElementById('numeri-ultima').innerHTML = '';
    }

    // Banner allarmi
    if ((s.numeri_sopra_soglia || 0) + (s.coppie_sopra_soglia || 0) > 0) {
      const banner = document.getElementById('banner-allarmi');
      banner.classList.remove('nascosto');
      banner.innerHTML = `⚠️ ALLERTA: ${s.numeri_sopra_soglia} numeri e ${s.coppie_sopra_soglia} coppie sopra soglia`;
    }
  } catch (e) {
    document.getElementById('stato-led').className = 'led errore';
    document.getElementById('stato-led').textContent = '🔴 Backend non raggiungibile';
  }
}

document.getElementById('btn-aggiorna').addEventListener('click', async () => {
  const btn = document.getElementById('btn-aggiorna');
  const msg = document.getElementById('msg-aggiornamento');
  btn.disabled = true;
  msg.textContent = 'Aggiornamento in corso...';
  msg.className = 'msg';

  try {
    const r = await api('/api/aggiorna', { method: 'POST' });
    msg.textContent = r.messaggio;
    msg.className = r.ok ? 'msg ok' : 'msg errore';
    await loadStato();
  } catch (e) {
    msg.textContent = 'Errore di comunicazione con il backend';
    msg.className = 'msg errore';
  } finally {
    btn.disabled = false;
  }
});

// ========== RITARDI ==========
async function loadRitardi() {
  const tbody = document.querySelector('#tabella-ritardi tbody');
  tbody.innerHTML = '<tr><td colspan="4">Caricamento...</td></tr>';
  try {
    const data = await api('/api/ritardi/numeri');
    tbody.innerHTML = data.map(r => `
      <tr class="${r.stato === 'allerta' ? 'allerta-row' : ''}">
        <td><strong>${r.numero}</strong></td>
        <td>${r.ritardo}</td>
        <td>${r.ultima_uscita || '—'}</td>
        <td>${r.stato === 'allerta' ? '⚠️ ALLERTA' : 'OK'}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">Errore: ${e.message}</td></tr>`;
  }
}

// ========== COPPIE ==========
async function loadCoppie() {
  const tbody = document.querySelector('#tabella-coppie tbody');
  tbody.innerHTML = '<tr><td colspan="4">Caricamento...</td></tr>';
  try {
    const data = await api('/api/ritardi/coppie?limit=80');
    tbody.innerHTML = data.map(c => `
      <tr class="${c.stato === 'allerta' ? 'allerta-row' : ''}">
        <td><strong>${c.coppia}</strong></td>
        <td>${c.ritardo}</td>
        <td>${c.soglia}</td>
        <td>${c.stato === 'allerta' ? '⚠️ ALLERTA' : 'OK'}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">Errore: ${e.message}</td></tr>`;
  }
}

// ========== ARCHIVIO ==========
async function loadArchivio() {
  const container = document.getElementById('lista-archivio');
  container.innerHTML = 'Caricamento...';
  try {
    const data = await api('/api/estrazioni?limit=40');
    if (data.length === 0) {
      container.innerHTML = '<p>Nessuna estrazione ancora archiviata.</p>';
      return;
    }
    container.innerHTML = data.map(e => `
      <div class="archivio-item">
        <div class="meta">${e.data} · ${e.ora} ${e.identificativo ? '· #' + e.identificativo : ''} · acquisita ${fmtDate(e.timestamp_acquisizione)}</div>
        <div class="numeri-grid">
          ${e.numeri.map(n => `<span class="num">${n}</span>`).join('')}
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `Errore: ${e.message}`;
  }
}

// ========== IMPOSTAZIONI ==========
async function loadImpostazioni() {
  try {
    const s = await api('/api/impostazioni');
    document.getElementById('soglia-numeri').value = s.soglia_numeri || 15;
    document.getElementById('soglia-coppie').value = s.soglia_coppie || 230;
  } catch {}
}

document.getElementById('btn-salva-impostazioni').addEventListener('click', async () => {
  const msg = document.getElementById('msg-impostazioni');
  try {
    await api('/api/impostazioni', {
      method: 'POST',
      body: JSON.stringify({
        soglia_numeri: document.getElementById('soglia-numeri').value,
        soglia_coppie: document.getElementById('soglia-coppie').value
      })
    });
    msg.textContent = 'Impostazioni salvate correttamente';
    msg.className = 'msg ok';
  } catch (e) {
    msg.textContent = 'Errore nel salvataggio';
    msg.className = 'msg errore';
  }
});

// ========== DIAGNOSTICA ==========
async function loadDiagnostica() {
  const el = document.getElementById('diag-info');
  try {
    const d = await api('/api/diagnostica');
    el.innerHTML = `
      <div><span class="label">Backend</span><span>${d.backend}</span></div>
      <div><span class="label">Database</span><span>${d.database}</span></div>
      <div><span class="label">Stato</span><span>${d.stato}</span></div>
      <div><span class="label">Totale estrazioni</span><span>${d.totale_estrazioni}</span></div>
      <div><span class="label">Ultimo successo</span><span>${fmtDate(d.ultimo_successo)}</span></div>
      <div><span class="label">Ultimo tentativo</span><span>${fmtDate(d.ultimo_tentativo)}</span></div>
      <div><span class="label">Ultimo errore</span><span>${d.ultimo_errore || '—'}</span></div>
      <div><span class="label">Durata ultima richiesta</span><span>${d.durata_ultima_ms ? d.durata_ultima_ms + ' ms' : '—'}</span></div>
      <div><span class="label">Timestamp ultima estrazione</span><span>${fmtDate(d.ultima_estrazione_timestamp)}</span></div>
    `;
  } catch (e) {
    el.innerHTML = `<div>Errore: ${e.message}</div>`;
  }
}

document.getElementById('btn-test-connessione').addEventListener('click', async () => {
  const btn = document.getElementById('btn-test-connessione');
  const msg = document.getElementById('msg-test');
  btn.disabled = true;
  msg.textContent = 'Test in corso...';
  try {
    const r = await api('/api/diagnostica/test', { method: 'POST' });
    msg.textContent = r.messaggio;
    msg.className = r.ok ? 'msg ok' : 'msg errore';
    await loadDiagnostica();
    await loadStato();
  } catch (e) {
    msg.textContent = 'Errore: ' + e.message;
    msg.className = 'msg errore';
  } finally {
    btn.disabled = false;
  }
});

// ========== Init ==========
loadStato();
setInterval(loadStato, 60000); // refresh stato ogni minuto

// ========== PWA + NOTIFICHE PUSH ==========
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registrato'))
    .catch(err => console.log('SW errore', err));
}

async function attivaNotifiche() {
  const msg = document.getElementById('msg-notifiche');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    msg.textContent = 'Notifiche non supportate su questo browser';
    msg.className = 'msg errore';
    return;
  }

  try {
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') {
      msg.textContent = 'Permesso notifiche negato. Attivale dalle impostazioni del browser.';
      msg.className = 'msg errore';
      return;
    }

    const reg = await navigator.serviceWorker.ready;

    // Per una versione completa servono le VAPID keys dal server.
    // Qui facciamo una versione base che mostra notifiche locali quando l'app è aperta,
    // e prepariamo il terreno per le push reali.
    msg.textContent = 'Notifiche attivate! Riceverai avvisi quando apri l\'app e in futuro anche a telefono chiuso.';
    msg.className = 'msg ok';

    // Salva preferenza
    localStorage.setItem('notifiche_attive', '1');

    // Mostra una notifica di test
    reg.showNotification('10eLotto Alert', {
      body: 'Notifiche attivate correttamente',
      icon: '/icon-192.png',
      vibrate: [200, 100, 200]
    });
  } catch (e) {
    msg.textContent = 'Errore: ' + e.message;
    msg.className = 'msg errore';
  }
}

document.getElementById('btn-attiva-notifiche')?.addEventListener('click', attivaNotifiche);

// Se le notifiche sono attive e c'è un'allerta, mostra notifica locale
async function checkAndNotify(stato) {
  if (localStorage.getItem('notifiche_attive') !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const n = stato.numeri_sopra_soglia || 0;
  const c = stato.coppie_sopra_soglia || 0;
  if (n + c === 0) return;

  // Evita di spamare: salva ultimo invio
  const last = localStorage.getItem('last_notify') || '0';
  const now = Date.now();
  if (now - parseInt(last) < 5 * 60 * 1000) return; // max 1 ogni 5 min

  localStorage.setItem('last_notify', String(now));

  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('⚠️ 10eLotto Alert', {
    body: `${n} numeri e ${c} coppie sopra soglia`,
    icon: '/icon-192.png',
    vibrate: [300, 100, 300],
    tag: '10elotto-alert',
    requireInteraction: true
  });
}

// Integra nel loadStato
const originalLoadStato = loadStato;
loadStato = async function() {
  await originalLoadStato();
  try {
    const s = await api('/api/stato');
    checkAndNotify(s);
  } catch {}
};
