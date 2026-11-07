const axios = require('axios');
const crypto = require('crypto');

// CORS cuma buat domain lu
const ALLOWED_ORIGINS = [
  'https://xs0cietylabsz.biz.id',
  'https://www.xs0cietylabsz.biz.id',
];

let cachedSecret = null;
let cacheTime = 0;

function setCors(req, res) {
    const origin = req.headers.origin || '';
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Fungsi Auto-Scrape Secret dari JS YTUltra
async function getSecret() {
    if (cachedSecret && Date.now() - cacheTime < 3600000) return cachedSecret;

    try {
        console.log('[YTUltra] Scraping secret key baru...');
        const html = await axios.get('https://www.ytultra.com/id/youtube-video-downloader/', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }).then(r => r.data);

        const scriptRegex = /<script[^>]+src="([^"]+)"/g;
        let match;
        const scripts = [];
        while ((match = scriptRegex.exec(html)) !== null) {
            let src = match[1];
            if (src.startsWith('/')) src = 'https://www.ytultra.com' + src;
            scripts.push(src);
        }

        for (const script of scripts) {
            const js = await axios.get(script).then(r => r.data).catch(() => '');
            // Regex nyari secret key (biasanya 32/64 karakter hex)
            const secretMatch = js.match(/["']([a-f0-9]{32,64})["']/i);
            if (secretMatch) {
                cachedSecret = secretMatch[1];
                cacheTime = Date.now();
                console.log('[YTUltra] Secret ditemukan:', cachedSecret);
                return cachedSecret;
            }
        }
    } catch (e) {
        console.error('[YTUltra] Scrape gagal:', e.message);
    }
    
    // Fallback kalau scrape gagal
    return 'a6c8b6738024a4b9e2f1d0c3b2a1b1c'; 
}

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        const secret = await getSecret();
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const bodyData = JSON.stringify({ url });
        
        // Generate signature (standar umum YTUltra)
        const sign = crypto.createHash('sha256').update(nonce + timestamp + bodyData + secret).digest('hex');

        const response = await axios.post('https://api.ytultra.com/ikool/youtube/download', bodyData, {
            headers: {
                'content-type': 'application/json',
                'lang': 'id',
                'nonce': nonce,
                'timestamp': timestamp,
                'sign': sign,
                'x-app-id': '2',
                'origin': 'https://www.ytultra.com',
                'referer': 'https://www.ytultra.com/',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36'
            },
            timeout: 30000
        });

        return res.status(200).json(response.data);
    } catch (error) {
        console.error('YTUltra Error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            error: 'Gagal ambil data dari YTUltra',
            detail: error.response?.data || error.message
        });
    }
};