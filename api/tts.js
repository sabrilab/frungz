// Voix des flashs FRUNGZ INFO : synthèse neuronale Azure (niveau gratuit F0 : 500 000 caractères par mois).
// La clé reste ici, côté serveur (variables Vercel AZURE_SPEECH_KEY et AZURE_SPEECH_REGION).
// Le jeu demande GET /api/tts?v=<voix>&r=<débit>&t=<texte> ; la réponse mp3 est gardée en cache par le CDN,
// donc une même réplique n'est synthétisée qu'une fois. Sans clé, /api/tts?probe=1 répond { ok: false }
// et le jeu garde la voix du navigateur.
const VOICES = new Set([
  'fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-FR-VivienneMultilingualNeural',
  'fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-AlainNeural',
]);
const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // app iPhone (capacitor://)
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION || 'westeurope';
  const q = req.query || {};
  if (q.probe) { res.setHeader('Cache-Control', 'public, s-maxage=300'); return res.status(200).json({ ok: !!key }); }
  if (!key) return res.status(503).json({ error: 'tts non configuré' });
  const voice = String(q.v || ''), text = String(q.t || '').trim(), rate = Math.max(-20, Math.min(30, parseInt(q.r, 10) || 0));
  if (!VOICES.has(voice) || !text || text.length > 400) return res.status(400).json({ error: 'requête invalide' });
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="fr-FR">`
    + `<voice name="${voice}"><prosody rate="${rate >= 0 ? '+' : ''}${rate}%">${esc(text)}</prosody></voice></speak>`;
  try {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'frungz-tts' },
      body: ssml,
    });
    if (!r.ok) return res.status(502).json({ error: `azure ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'azure injoignable' });
  }
};
