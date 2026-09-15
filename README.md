# 10eLotto Alert

Web app per monitorare le estrazioni del 10eLotto ogni 5 minuti, con ritardi numeri/coppie, soglie e allarmi.

## Avvio locale

```bash
node server.js
```

Apri http://localhost:3847

## Deploy online (sempre raggiungibile dal telefono)

### Opzione A – Railway (consigliata)

1. Vai su https://railway.app e crea un account (gratis)
2. Clicca **New Project** → **Deploy from GitHub** (o carica i file)
3. Seleziona questa cartella
4. Railway rileva automaticamente Node.js e avvia `npm start`
5. Quando è online, clicca sul dominio generato (tipo `xxx.up.railway.app`)
6. Apri quel link dal telefono Android

### Opzione B – Render

1. Vai su https://render.com
2. New → Web Service
3. Collega il repository o carica i file
4. Build Command: (lascia vuoto)
5. Start Command: `node server.js`
6. Crea il servizio (piano Free)

### Note importanti

- L’app usa solo moduli nativi di Node → zero dipendenze da installare
- I dati vengono salvati in `data/db.json` (su hosting free il filesystem può essere effimero: per persistenza reale serve un database esterno, ma per uso personale va bene)
- L’aggiornamento automatico ogni 5 minuti funziona finché il servizio è attivo

## API principali

- `GET /api/stato`
- `POST /api/aggiorna`
- `GET /api/ritardi/numeri`
- `GET /api/ritardi/coppie`
- `GET/POST /api/impostazioni`
- `GET /api/diagnostica`
