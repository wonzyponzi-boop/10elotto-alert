/**
 * Calcolo ritardi numeri e coppie lato server.
 */

const db = require('./db');

function getEstrazioniOrdered() {
  return db.getEstrazioni(5000).map(row => ({
    ...row,
    numeri: typeof row.numeri === 'string' ? JSON.parse(row.numeri) : row.numeri
  }));
}

function calcolaRitardiNumeri() {
  const estrazioni = getEstrazioniOrdered();
  const imp = db.getImpostazioni();
  const soglia = parseInt(imp.soglia_numeri || '15', 10);

  if (estrazioni.length === 0) {
    return Array.from({ length: 90 }, (_, i) => ({
      numero: i + 1,
      ritardo: 0,
      ultima_uscita: null,
      stato: 'normale',
      soglia
    }));
  }

  const risultati = [];
  for (let n = 1; n <= 90; n++) {
    let ritardo = 0;
    let ultimaUscita = null;
    for (const e of estrazioni) {
      if (e.numeri.includes(n)) {
        ultimaUscita = `${e.data} ${e.ora}`;
        break;
      }
      ritardo++;
    }
    risultati.push({
      numero: n,
      ritardo,
      ultima_uscita: ultimaUscita,
      stato: ritardo >= soglia ? 'allerta' : 'normale',
      soglia
    });
  }
  risultati.sort((a, b) => b.ritardo - a.ritardo);
  return risultati;
}

function calcolaRitardiCoppie(limit = 50) {
  const estrazioni = getEstrazioniOrdered();
  const imp = db.getImpostazioni();
  const soglia = parseInt(imp.soglia_coppie || '230', 10);

  if (estrazioni.length === 0) return [];

  const lastSeenTogether = new Map();

  for (let i = 0; i < estrazioni.length; i++) {
    const nums = estrazioni[i].numeri;
    for (let x = 0; x < nums.length; x++) {
      for (let y = x + 1; y < nums.length; y++) {
        const a = Math.min(nums[x], nums[y]);
        const b = Math.max(nums[x], nums[y]);
        const key = `${a}-${b}`;
        if (!lastSeenTogether.has(key)) {
          lastSeenTogether.set(key, i);
        }
      }
    }
  }

  const risultati = [];
  for (let a = 1; a <= 89; a++) {
    for (let b = a + 1; b <= 90; b++) {
      const key = `${a}-${b}`;
      const lastIdx = lastSeenTogether.has(key) ? lastSeenTogether.get(key) : estrazioni.length;
      const ritardo = lastIdx;
      if (ritardo >= soglia || risultati.length < 40) {
        risultati.push({
          coppia: `${a} - ${b}`,
          a, b,
          ritardo,
          soglia,
          stato: ritardo >= soglia ? 'allerta' : 'normale'
        });
      }
    }
  }

  risultati.sort((x, y) => y.ritardo - x.ritardo);
  return risultati.slice(0, limit);
}

function getNumeriSopraSoglia() {
  return calcolaRitardiNumeri().filter(r => r.stato === 'allerta');
}

function getCoppieSopraSoglia() {
  return calcolaRitardiCoppie(200).filter(r => r.stato === 'allerta');
}

module.exports = {
  calcolaRitardiNumeri,
  calcolaRitardiCoppie,
  getNumeriSopraSoglia,
  getCoppieSopraSoglia
};
