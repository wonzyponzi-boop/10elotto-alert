const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');
const { eseguiAggiornamento } = require('./updater');
const {
  calcolaRitardiNumeri,
  calcolaRitardiCoppie,
  getNumeriSopraSoglia,
  getCoppieSopraSoglia
} = require('./ritardi');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/stato', (req, res) => {
  const stato = db.getStato();
  const ultima = db.getEstrazioni(1)[0] || null;
  const numeriAllerta = getNumeriSopraSoglia().length;
  const coppieAllerta = getCoppieSopraSoglia().length;

  res.json({
    stato: stato.stato,
    ultimo_successo: stato.ultimo_successo,
    ultimo_tentativo: stato.ultimo_tentativo,
    ultimo_errore: stato.ultimo_errore,
    nuove_ultimo: stato.nuove_estrazioni_ultimo,
    durata_ms: stato.durata_ultima_richiesta_ms,
    totale_estrazioni: stato.totale_estrazioni,
    numeri_sopra_soglia: numeriAllerta,
    coppie_sopra_soglia: coppieAllerta,
    ultima_estrazione: ultima ? {
      data: ultima.data,
      ora: ultima.ora,
      identificativo: ultima.identificativo,
      numeri: Array.isArray(ultima.numeri) ? ultima.numeri : JSON.parse(ultima.numeri || '[]'),
      acquisita: ultima.timestamp_acquisizione
    } : null
  });
});

app.get('/api/estrazioni', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
  const rows = db.getEstrazioni(limit);
  res.json(rows.map(r => ({
    ...r,
    numeri: Array.isArray(r.numeri) ? r.numeri : JSON.parse(r.numeri || '[]')
  })));
});

app.get('/api/ritardi/numeri', (req, res) => {
  res.json(calcolaRitardiNumeri());
});

app.get('/api/ritardi/coppie', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  res.json(calcolaRitardiCoppie(limit));
});

app.get('/api/impostazioni', (req, res) => {
  res.json(db.getImpostazioni());
});

app.post('/api/impostazioni', (req, res) => {
  const { soglia_numeri, soglia_coppie } = req.body;
  if (soglia_numeri !== undefined) {
    const v = Math.max(1, Math.min(500, parseInt(soglia_numeri, 10) || 15));
    db.setImpostazione('soglia_numeri', v);
  }
  if (soglia_coppie !== undefined) {
    const v = Math.max(1, Math.min(2000, parseInt(soglia_coppie, 10) || 230));
    db.setImpostazione('soglia_coppie', v);
  }
  res.json({ ok: true });
});

app.post('/api/aggiorna', async (req, res) => {
  const result = await eseguiAggiornamento('manuale');
  res.json(result);
});

app.get('/api/allarmi', (req, res) => {
  res.json(db.getAllarmiNonVisti(50));
});

app.post('/api/allarmi/visto', (req, res) => {
  db.marcaAllarmiVisti();
  res.json({ ok: true });
});

app.get('/api/diagnostica', (req, res) => {
  const stato = db.getStato();
  const ultima = db.getEstrazioni(1)[0];
  res.json({
    backend: 'ok',
    database: 'ok',
    totale_estrazioni: stato.totale_estrazioni,
    ultimo_successo: stato.ultimo_successo,
    ultimo_tentativo: stato.ultimo_tentativo,
    ultimo_errore: stato.ultimo_errore,
    stato: stato.stato,
    durata_ultima_ms: stato.durata_ultima_richiesta_ms,
    ultima_estrazione_timestamp: ultima?.timestamp_acquisizione || null,
    ultima_estrazione_data_ora: ultima ? `${ultima.data} ${ultima.ora}` : null
  });
});

app.post('/api/diagnostica/test', async (req, res) => {
  const result = await eseguiAggiornamento('test_diagnostica');
  res.json(result);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 10eLotto Alert avviato su http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/stato\n`);

  setTimeout(() => {
    eseguiAggiornamento('avvio').then(r => {
      console.log('[AVVIO]', r.messaggio);
    });
  }, 3000);

  cron.schedule('*/5 * * * *', () => {
    console.log('[CRON] Aggiornamento automatico...');
    eseguiAggiornamento('cron').then(r => {
      console.log('[CRON]', r.messaggio);
    });
  });
});
