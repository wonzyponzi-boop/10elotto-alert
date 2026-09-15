/**
 * 10eLotto Alert - Server puro Node.js (zero dipendenze)
 * Funziona su qualsiasi dispositivo, ottimizzato per smartphone Android.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3847;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const FRONTEND_DIR = path.join(__dirname, 'frontend');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ========== DATABASE (JSON) ==========
const defaultData = {
  estrazioni: [],
  impostazioni: { soglia_numeri: '15', soglia_coppie: '230' },
  stato: {
    ultimo_successo: null,
    ultimo_tentativo: null,
    ultimo_errore: null,
    stato: 'sconosciuto',
    nuove: 0,
    durata_ms: null,
    totale: 0
  },
  allarmi: [],
  nextId: 1
};

let data = defaultData;
try {
  if (fs.existsSync(DB_FILE)) data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) {}

function save() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

// ========== SORGENTE DATI ==========
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';

async function fetchDraws() {
  const errors = [];
  // Tentativo 1
  try {
    const res = await fetch('https://10elotto5minuti.com/estrazioni-di-oggi', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const html = await res.text();
      const draws = parse10e(html);
      if (draws.length) return draws;
    }
  } catch (e) { errors.push('src1: ' + e.message); }

  // Tentativo 2
  try {
    const res = await fetch('https://lottologia.com/10elotto5minuti/', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const html = await res.text();
      const draws = parseLotto(html);
      if (draws.length) return draws;
    }
  } catch (e) { errors.push('src2: ' + e.message); }

  throw new Error('Sorgente non disponibile. ' + errors.join(' | '));
}

function parse10e(html) {
  const draws = [];
  const today = new Date().toISOString().slice(0, 10);
  const re = /ore\s+(\d{1,2}):(\d{2})\s+n\.\s*(\d+)[\s\S]*?((?:\d{1,2}\s+){19}\d{1,2})/gi;
  let m;
  while ((m = re.exec(html)) && draws.length < 6) {
    const nums = m[4].trim().split(/\s+/).map(n => +n).filter(n => n >= 1 && n <= 90);
    if (nums.length === 20) {
      draws.push({
        data: today,
        ora: m[1].padStart(2,'0') + ':' + m[2],
        id: m[3],
        numeri: nums.sort((a,b)=>a-b)
      });
    }
  }
  return draws;
}

function parseLotto(html) {
  const draws = [];
  const mesi = {Gen:'01',Feb:'02',Mar:'03',Apr:'04',Mag:'05',Giu:'06',Lug:'07',Ago:'08',Set:'09',Ott:'10',Nov:'11',Dic:'12'};
  const re = /#(\d+)\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})[\s\S]*?Numeri[\s\S]*?((?:\d{1,2}\s+){19}\d{1,2})/gi;
  let m;
  while ((m = re.exec(html)) && draws.length < 5) {
    const nums = m[7].trim().split(/\s+/).map(n => +n).filter(n => n >= 1 && n <= 90);
    if (nums.length === 20) {
      draws.push({
        data: m[4] + '-' + (mesi[m[3]]||'01') + '-' + m[2].padStart(2,'0'),
        ora: m[5].padStart(2,'0') + ':' + m[6],
        id: m[1],
        numeri: nums.sort((a,b)=>a-b)
      });
    }
  }
  return draws;
}

function makeHash(d) {
  return d.data + '|' + d.ora + '|' + d.numeri.join(',');
}

// ========== AGGIORNAMENTO ==========
async function aggiorna() {
  const start = Date.now();
  const now = new Date().toISOString();
  data.stato.ultimo_tentativo = now;
  save();

  try {
    const draws = await fetchDraws();
    let nuove = 0;
    for (const d of draws) {
      const hash = makeHash(d);
      if (data.estrazioni.some(e => e.hash_unico === hash)) continue;
      data.estrazioni.push({
        id: data.nextId++,
        data: d.data,
        ora: d.ora,
        identificativo: d.id,
        numeri: d.numeri,
        timestamp_acquisizione: now,
        hash_unico: hash
      });
      nuove++;
    }
    // Mantieni max 2000 estrazioni
    if (data.estrazioni.length > 2000) data.estrazioni = data.estrazioni.slice(-2000);

    const durata = Date.now() - start;
    data.stato = {
      ...data.stato,
      ultimo_successo: now,
      ultimo_errore: null,
      stato: nuove > 0 ? 'ok' : 'nessuna_nuova',
      nuove,
      durata_ms: durata,
      totale: data.estrazioni.length
    };
    save();
    if (nuove > 0) generaAllarmi();
    return { ok: true, nuove, totale: data.estrazioni.length, durata_ms: durata,
      messaggio: nuove > 0 ? `Aggiornamento riuscito: ${nuove} nuove estrazioni` : 'Nessuna nuova estrazione' };
  } catch (err) {
    const durata = Date.now() - start;
    data.stato.ultimo_errore = err.message;
    data.stato.stato = 'errore';
    data.stato.durata_ms = durata;
    save();
    return { ok: false, errore: err.message, durata_ms: durata,
      messaggio: 'AGGIORNAMENTO NON RIUSCITO: ' + err.message };
  }
}

// ========== RITARDI ==========
function getEstrazioniOrd() {
  return data.estrazioni.slice().sort((a,b) => {
    if (a.data !== b.data) return b.data.localeCompare(a.data);
    return b.ora.localeCompare(a.ora);
  });
}

function ritardiNumeri() {
  const estr = getEstrazioniOrd();
  const soglia = +data.impostazioni.soglia_numeri || 15;
  const out = [];
  for (let n = 1; n <= 90; n++) {
    let rit = 0, ultima = null;
    for (const e of estr) {
      if (e.numeri.includes(n)) { ultima = e.data + ' ' + e.ora; break; }
      rit++;
    }
    out.push({ numero: n, ritardo: rit, ultima_uscita: ultima, stato: rit >= soglia ? 'allerta' : 'normale', soglia });
  }
  return out.sort((a,b) => b.ritardo - a.ritardo);
}

function ritardiCoppie(limit = 50) {
  const estr = getEstrazioniOrd();
  const soglia = +data.impostazioni.soglia_coppie || 230;
  if (!estr.length) return [];
  const last = new Map();
  for (let i = 0; i < estr.length; i++) {
    const nums = estr[i].numeri;
    for (let x = 0; x < nums.length; x++)
      for (let y = x+1; y < nums.length; y++) {
        const a = Math.min(nums[x], nums[y]), b = Math.max(nums[x], nums[y]);
        const k = a + '-' + b;
        if (!last.has(k)) last.set(k, i);
      }
  }
  const out = [];
  for (let a = 1; a <= 89; a++)
    for (let b = a+1; b <= 90; b++) {
      const k = a + '-' + b;
      const rit = last.has(k) ? last.get(k) : estr.length;
      if (rit >= soglia || out.length < 40)
        out.push({ coppia: a + ' - ' + b, a, b, ritardo: rit, soglia, stato: rit >= soglia ? 'allerta' : 'normale' });
    }
  return out.sort((x,y) => y.ritardo - x.ritardo).slice(0, limit);
}

function generaAllarmi() {
  const now = new Date().toISOString();
  const ultima = getEstrazioniOrd()[0];
  if (!ultima) return;
  for (const r of ritardiNumeri().filter(r => r.stato === 'allerta')) {
    if (!data.allarmi.some(a => a.tipo==='numero' && a.riferimento===String(r.numero) && a.estrazione_id===ultima.id))
      data.allarmi.push({ id: data.nextId++, tipo:'numero', riferimento:String(r.numero), ritardo:r.ritardo, soglia:r.soglia, estrazione_id:ultima.id, timestamp_allarme:now, visto:false });
  }
  for (const c of ritardiCoppie(100).filter(c => c.stato === 'allerta')) {
    if (!data.allarmi.some(a => a.tipo==='coppia' && a.riferimento===c.coppia && a.estrazione_id===ultima.id))
      data.allarmi.push({ id: data.nextId++, tipo:'coppia', riferimento:c.coppia, ritardo:c.ritardo, soglia:c.soglia, estrazione_id:ultima.id, timestamp_allarme:now, visto:false });
  }
  if (data.allarmi.length > 300) data.allarmi = data.allarmi.slice(-300);
  save();
}

// ========== HTTP SERVER ==========
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.ico':'image/x-icon' };

function send(res, code, body, type = 'application/json') {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
  if (Buffer.isBuffer(body)) {
    headers['Content-Type'] = type;
    res.writeHead(code, headers);
    res.end(body);
  } else if (typeof body === 'string') {
    headers['Content-Type'] = type + '; charset=utf-8';
    res.writeHead(code, headers);
    res.end(body);
  } else {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(code, headers);
    res.end(JSON.stringify(body));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  // API
  if (p === '/api/stato') {
    const ultima = getEstrazioniOrd()[0] || null;
    const nn = ritardiNumeri().filter(r => r.stato==='allerta').length;
    const nc = ritardiCoppie(200).filter(c => c.stato==='allerta').length;
    return send(res, 200, {
      stato: data.stato.stato,
      ultimo_successo: data.stato.ultimo_successo,
      ultimo_tentativo: data.stato.ultimo_tentativo,
      ultimo_errore: data.stato.ultimo_errore,
      nuove_ultimo: data.stato.nuove,
      durata_ms: data.stato.durata_ms,
      totale_estrazioni: data.stato.totale,
      numeri_sopra_soglia: nn,
      coppie_sopra_soglia: nc,
      ultima_estrazione: ultima ? {
        data: ultima.data, ora: ultima.ora, identificativo: ultima.identificativo,
        numeri: ultima.numeri, acquisita: ultima.timestamp_acquisizione
      } : null
    });
  }

  if (p === '/api/estrazioni') {
    const limit = Math.min(+(u.searchParams.get('limit')||30), 80);
    return send(res, 200, getEstrazioniOrd().slice(0, limit));
  }

  if (p === '/api/ritardi/numeri') return send(res, 200, ritardiNumeri());
  if (p === '/api/ritardi/coppie') {
    const limit = Math.min(+(u.searchParams.get('limit')||50), 100);
    return send(res, 200, ritardiCoppie(limit));
  }

  if (p === '/api/impostazioni' && req.method === 'GET') return send(res, 200, data.impostazioni);
  if (p === '/api/impostazioni' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const j = JSON.parse(body);
      if (j.soglia_numeri !== undefined) data.impostazioni.soglia_numeri = String(Math.max(1, Math.min(500, +j.soglia_numeri||15)));
      if (j.soglia_coppie !== undefined) data.impostazioni.soglia_coppie = String(Math.max(1, Math.min(2000, +j.soglia_coppie||230)));
      save();
      return send(res, 200, { ok: true });
    } catch { return send(res, 400, { error: 'body non valido' }); }
  }

  if (p === '/api/aggiorna' && req.method === 'POST') {
    const r = await aggiorna();
    return send(res, 200, r);
  }

  if (p === '/api/diagnostica') {
    const ultima = getEstrazioniOrd()[0];
    return send(res, 200, {
      backend: 'ok', database: 'ok',
      totale_estrazioni: data.stato.totale,
      ultimo_successo: data.stato.ultimo_successo,
      ultimo_tentativo: data.stato.ultimo_tentativo,
      ultimo_errore: data.stato.ultimo_errore,
      stato: data.stato.stato,
      durata_ultima_ms: data.stato.durata_ms,
      ultima_estrazione_timestamp: ultima?.timestamp_acquisizione || null,
      ultima_estrazione_data_ora: ultima ? ultima.data + ' ' + ultima.ora : null
    });
  }

  if (p === '/api/diagnostica/test' && req.method === 'POST') {
    const r = await aggiorna();
    return send(res, 200, r);
  }

  // Static frontend
  let file = p === '/' ? '/index.html' : p;
  const fp = path.join(FRONTEND_DIR, file);
  if (fp.startsWith(FRONTEND_DIR) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp);
    return send(res, 200, fs.readFileSync(fp), mime[ext] || 'text/plain');
  }

  // SPA fallback
  const index = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(index)) return send(res, 200, fs.readFileSync(index), 'text/html');
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 10eLotto Alert avviato');
  console.log('   Apri dal telefono: http://<IP-DI-QUESTO-PC>:' + PORT);
  console.log('   Locale: http://localhost:' + PORT + '\n');

  // Primo aggiornamento
  setTimeout(() => aggiorna().then(r => console.log('[AVVIO]', r.messaggio)), 2000);

  // Ogni 5 minuti
  setInterval(() => {
    console.log('[CRON] Aggiornamento...');
    aggiorna().then(r => console.log('[CRON]', r.messaggio));
  }, 5 * 60 * 1000);
});
