/**
 * Database leggero basato su file JSON (nessuna dipendenza nativa).
 * Persistente, semplice, affidabile.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultData = {
  estrazioni: [],
  impostazioni: {
    soglia_numeri: '15',
    soglia_coppie: '230'
  },
  stato_sistema: {
    ultimo_successo: null,
    ultimo_tentativo: null,
    ultimo_errore: null,
    stato: 'sconosciuto',
    nuove_estrazioni_ultimo: 0,
    durata_ultima_richiesta_ms: null,
    totale_estrazioni: 0
  },
  allarmi: [],
  nextId: 1
};

let data = defaultData;

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Errore lettura DB, uso default', e.message);
    data = JSON.parse(JSON.stringify(defaultData));
  }
}

function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Errore salvataggio DB', e.message);
  }
}

load();

const db = {
  getEstrazioni(limit = 100) {
    return data.estrazioni
      .slice()
      .sort((a, b) => {
        if (a.data !== b.data) return b.data.localeCompare(a.data);
        return b.ora.localeCompare(a.ora);
      })
      .slice(0, limit);
  },

  insertEstrazione(estrazione) {
    if (data.estrazioni.some(e => e.hash_unico === estrazione.hash_unico)) {
      return { changes: 0 };
    }
    const row = {
      id: data.nextId++,
      ...estrazione,
      created_at: new Date().toISOString()
    };
    data.estrazioni.push(row);
    data.stato_sistema.totale_estrazioni = data.estrazioni.length;
    save();
    return { changes: 1 };
  },

  countEstrazioni() {
    return data.estrazioni.length;
  },

  getStato() {
    return { ...data.stato_sistema };
  },

  updateStato(updates) {
    Object.assign(data.stato_sistema, updates);
    save();
  },

  getImpostazioni() {
    return { ...data.impostazioni };
  },

  setImpostazione(chiave, valore) {
    data.impostazioni[chiave] = String(valore);
    save();
  },

  getAllarmiNonVisti(limit = 50) {
    return data.allarmi.filter(a => !a.visto).slice(0, limit);
  },

  insertAllarme(allarme) {
    const exists = data.allarmi.some(a =>
      a.tipo === allarme.tipo &&
      a.riferimento === allarme.riferimento &&
      a.estrazione_id === allarme.estrazione_id
    );
    if (exists) return;
    data.allarmi.push({
      id: data.nextId++,
      ...allarme,
      visto: false
    });
    if (data.allarmi.length > 500) data.allarmi = data.allarmi.slice(-500);
    save();
  },

  marcaAllarmiVisti() {
    data.allarmi.forEach(a => a.visto = true);
    save();
  },

  _raw() { return data; },
  save
};

module.exports = db;
