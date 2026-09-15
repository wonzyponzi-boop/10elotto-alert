/**
 * Connettore sorgente dati 10eLotto ogni 5 minuti.
 * Usa fetch nativo di Node.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchLatestDraws() {
  const errors = [];

  try {
    const draws = await fetchFromLottologia();
    if (draws && draws.length > 0) return draws;
  } catch (e) {
    errors.push(`Lottologia: ${e.message}`);
  }

  try {
    const draws = await fetchFrom10elotto5minuti();
    if (draws && draws.length > 0) return draws;
  } catch (e) {
    errors.push(`10elotto5minuti: ${e.message}`);
  }

  throw new Error(
    `Impossibile recuperare estrazioni da nessuna sorgente. Dettagli: ${errors.join(' | ')}`
  );
}

async function fetchFromLottologia() {
  const url = 'https://lottologia.com/10elotto5minuti/';
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const draws = [];
  const blockRegex = /#(\d+)\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})[\s\S]*?Numeri[\s\S]*?((?:\d{1,2}\s+){19}\d{1,2})/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && draws.length < 5) {
    const [, id, day, mon, year, hour, min, numsStr] = match;
    const numbers = numsStr.trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 90);
    if (numbers.length === 20) {
      const mesi = { Gen: '01', Feb: '02', Mar: '03', Apr: '04', Mag: '05', Giu: '06',
                     Lug: '07', Ago: '08', Set: '09', Ott: '10', Nov: '11', Dic: '12' };
      const mese = mesi[mon] || '01';
      draws.push({
        data: `${year}-${mese}-${day.padStart(2, '0')}`,
        ora: `${hour.padStart(2, '0')}:${min}`,
        identificativo: id,
        numeri: numbers.sort((a, b) => a - b)
      });
    }
  }

  if (draws.length === 0) throw new Error('Nessuna estrazione parsata dal HTML');
  return draws;
}

async function fetchFrom10elotto5minuti() {
  const url = 'https://10elotto5minuti.com/estrazioni-di-oggi';
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const draws = [];
  const today = new Date();
  const dataStr = today.toISOString().slice(0, 10);

  const blockRegex = /ore\s+(\d{1,2}):(\d{2})\s+n\.\s*(\d+)[\s\S]*?((?:\d{1,2}\s+){19}\d{1,2})/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && draws.length < 8) {
    const [, hour, min, id, numsStr] = match;
    const numbers = numsStr.trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 90);
    if (numbers.length === 20) {
      draws.push({
        data: dataStr,
        ora: `${hour.padStart(2, '0')}:${min}`,
        identificativo: id,
        numeri: numbers.sort((a, b) => a - b)
      });
    }
  }

  if (draws.length === 0) throw new Error('Nessuna estrazione parsata');
  return draws;
}

function makeHash(draw) {
  return `${draw.data}|${draw.ora}|${draw.numeri.join(',')}`;
}

module.exports = { fetchLatestDraws, makeHash };
