/**
 * MediaNet Agency Hub — Fatture in Cloud Proxy v2.0
 * Vercel Serverless Function
 * Route: /api/fic?action=...
 */

const https = require('https');

function ficRequest(path, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-v2.fattureincloud.it',
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch(e) { data = { raw_body: raw }; }
        resolve({ status: res.statusCode, data, raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fic-Token, X-Company-Id');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const token     = req.headers['x-fic-token'];
  const companyId = req.headers['x-company-id'];
  const action    = req.query.action || 'health';
  const year      = req.query.year || new Date().getFullYear();

  if (action === 'health') {
    res.status(200).json({ ok: true, message: 'MediaNet FiC Proxy attivo ✓', version: '2.0' });
    return;
  }

  if (!token) {
    res.status(401).json({ error: 'Token mancante nei headers' });
    return;
  }

  try {

    if (action === 'debug') {
      const results = {};
      const user = await ficRequest('/user/info', token);
      results.user_info = { status: user.status, data: user.data };
      const companies = await ficRequest('/user/companies', token);
      results.companies = { status: companies.status, data: companies.data };
      if (companyId) {
        const c1 = await ficRequest(`/c/${companyId}/entities/clients?per_page=5`, token);
        results['clients_entities'] = { status: c1.status, data: c1.data };
        const c2 = await ficRequest(`/c/${companyId}/clients?per_page=5`, token);
        results['clients_legacy'] = { status: c2.status, data: c2.data };
        const inv = await ficRequest(`/c/${companyId}/issued_documents?type=invoice&per_page=5`, token);
        results['invoices'] = { status: inv.status, data: inv.data };
        const prod = await ficRequest(`/c/${companyId}/products?per_page=5`, token);
        results['products'] = { status: prod.status, data: prod.data };
      }
      res.status(200).json(results);
      return;
    }

    if (action === 'companies') {
      const result = await ficRequest('/user/companies', token);
      if (result.status >= 400) return res.status(result.status).json({ error: `FiC Error ${result.status}`, fic_detail: result.data });
      return res.status(200).json(result.data);
    }

    if (action === 'clients') {
      if (!companyId) return res.status(400).json({ error: 'Company ID mancante' });
      let result = await ficRequest(`/c/${companyId}/entities/clients?per_page=200`, token);
      if (result.status === 404 || result.status === 405) {
        result = await ficRequest(`/c/${companyId}/clients?per_page=200`, token);
      }
      if (result.status >= 400) {
        return res.status(result.status).json({
          error: `FiC Error ${result.status} su clienti`,
          fic_detail: result.data,
          hint: result.status === 401 ? 'Il token non ha il permesso entity.clients:r — rigeneralo con tutti i permessi' : 'Company ID corretto?'
        });
      }
      return res.status(200).json(result.data);
    }

    if (action === 'invoices') {
      if (!companyId) return res.status(400).json({ error: 'Company ID mancante' });
      const result = await ficRequest(`/c/${companyId}/issued_documents?type=invoice&year=${year}&per_page=200`, token);
      if (result.status >= 400) {
        return res.status(result.status).json({
          error: `FiC Error ${result.status} su fatture`,
          fic_detail: result.data,
          hint: result.status === 401 ? 'Il token non ha il permesso issued_documents:r — rigeneralo con tutti i permessi' : 'Errore generico FiC'
        });
      }
      return res.status(200).json(result.data);
    }

    if (action === 'products') {
      if (!companyId) return res.status(400).json({ error: 'Company ID mancante' });
      const result = await ficRequest(`/c/${companyId}/products?per_page=200`, token);
      if (result.status >= 400) return res.status(result.status).json({ error: `FiC Error ${result.status}`, fic_detail: result.data });
      return res.status(200).json(result.data);
    }

    res.status(404).json({ error: 'Action non valida', valid: ['health','debug','companies','clients','invoices','products'] });

  } catch (err) {
    res.status(500).json({ error: 'Errore interno proxy: ' + err.message });
  }
};
