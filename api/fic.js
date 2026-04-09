/**
 * MediaNet Agency Hub — Fatture in Cloud Proxy
 * Vercel Serverless Function
 * Route: /api/fic?action=...
 */

const https = require('https');

function ficRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-v2.fattureincloud.it',
      path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fic-Token, X-Company-Id');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const token     = req.headers['x-fic-token'];
  const companyId = req.headers['x-company-id'];
  const action    = req.query.action || 'health';
  const year      = req.query.year || new Date().getFullYear();

  if (action === 'health') {
    res.status(200).json({ ok: true, message: 'MediaNet FiC Proxy attivo ✓', version: '1.0' });
    return;
  }

  if (!token) {
    res.status(401).json({ error: 'Token mancante' });
    return;
  }

  try {
    let result;

    if (action === 'companies') {
      result = await ficRequest('/user/companies', token);
    } else if (action === 'clients') {
      if (!companyId) { res.status(400).json({ error: 'Company ID mancante' }); return; }
      result = await ficRequest(`/c/${companyId}/clients?per_page=100`, token);
    } else if (action === 'invoices') {
      if (!companyId) { res.status(400).json({ error: 'Company ID mancante' }); return; }
      result = await ficRequest(`/c/${companyId}/issued_documents?type=invoice&year=${year}&per_page=100`, token);
    } else if (action === 'products') {
      if (!companyId) { res.status(400).json({ error: 'Company ID mancante' }); return; }
      result = await ficRequest(`/c/${companyId}/products?per_page=100`, token);
    } else {
      res.status(404).json({ error: 'Action non valida', valid: ['health','companies','clients','invoices','products'] });
      return;
    }

    res.status(result.status).json(result.data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
