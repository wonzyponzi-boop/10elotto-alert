const db = require('./db');
const { fetchLatestDraws, makeHash } = require('./dataSource');
const { getNumeriSopraSoglia, getCoppieSopraSoglia } = require('./ritardi');

async function eseguiAggiornamento(motivo = 'automatico') {
  const start = Date.now();
  const now = new Date().toISOString();

  db.updateStato({ ultimo_tentativo: now });

  try {
    const draws = await fetchLatestDraws();
    let nuove = 0;

    for (const d of draws) {
      const hash = makeHash(d);
      const result = db.insertEstrazione({
        data: d.data,
        ora: d.ora,
        identificativo: d.identificativo || null,
        numeri: d.numeri,
        timestamp_acquisizione: now,
        hash_unico: hash
      });
      if (result.changes > 0) nuove++;
    }

    const durata = Date.now() - start;
    const totale = db.countEstrazioni();

    db.updateStato({
      ultimo_successo: now,
      ultimo_errore: null,
      stato: nuove > 0 ? 'ok' : 'nessuna_nuova',
      nuove_estrazioni_ultimo: nuove,
      durata_ultima_richiesta_ms: durata,
      totale_estrazioni: totale
    });

    if (nuove > 0) {
      generaAllarmi();
    }

    return {
      ok: true,
      nuove,
      totale,
      durata_ms: durata,
      messaggio: nuove > 0
        ? `Aggiornamento riuscito: ${nuove} nuove estrazioni`
        : 'Nessuna nuova estrazione'
    };
  } catch (err) {
    const durata = Date.now() - start;
    db.updateStato({
      ultimo_errore: err.message,
      stato: 'errore',
      durata_ultima_richiesta_ms: durata
    });

    return {
      ok: false,
      errore: err.message,
      durata_ms: durata,
      messaggio: `AGGIORNAMENTO NON RIUSCITO: ${err.message}`
    };
  }
}

function generaAllarmi() {
  const now = new Date().toISOString();
  const estrazioni = db.getEstrazioni(1);
  if (estrazioni.length === 0) return;
  const ultimaId = estrazioni[0].id;

  for (const r of getNumeriSopraSoglia()) {
    db.insertAllarme({
      tipo: 'numero',
      riferimento: String(r.numero),
      ritardo: r.ritardo,
      soglia: r.soglia,
      estrazione_id: ultimaId,
      timestamp_allarme: now
    });
  }

  for (const c of getCoppieSopraSoglia()) {
    db.insertAllarme({
      tipo: 'coppia',
      riferimento: c.coppia,
      ritardo: c.ritardo,
      soglia: c.soglia,
      estrazione_id: ultimaId,
      timestamp_allarme: now
    });
  }
}

module.exports = { eseguiAggiornamento };
