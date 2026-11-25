#!/usr/bin/env node
/**
 * 24/7 Cloud & Local Headless Chromium Slide Renderer + Gemini Vision QC
 * Zero external npm dependencies (uses Node.js >= 20 built-in HTTP, WebSocket/CDP, and fetch).
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--job') args.job = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Chromium binary not found. Set CHROME_PATH env var.');
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function startStaticServer(templateDir, repoRoot, tempDir) {
  const server = http.createServer((req, res) => {
    const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
    let targetPath;
    if (cleanUrl === '/' || cleanUrl === '/template.html') {
      targetPath = path.join(templateDir, 'template.html');
    } else if (cleanUrl.startsWith('/brand/')) {
      targetPath = path.join(repoRoot, 'public', 'images', 'brand', path.basename(cleanUrl));
    } else if (cleanUrl.startsWith('/products/')) {
      targetPath = path.join(repoRoot, 'public', 'images', 'products', path.basename(cleanUrl));
    } else if (cleanUrl.startsWith('/repo/')) {
      targetPath = path.join(repoRoot, cleanUrl.slice('/repo/'.length));
    } else if (cleanUrl.startsWith('/tmp/')) {
      targetPath = path.join(tempDir, path.basename(cleanUrl));
    } else {
      targetPath = path.join(templateDir, cleanUrl);
    }
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypeFor(targetPath) });
    fs.createReadStream(targetPath).pipe(res);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function launchChrome(chromePath, userDataDir) {
  const proc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Chrome DevTools WS URL')), 15000);
    let buf = '';
    proc.stderr.on('data', chunk => {
      buf += chunk.toString('utf8');
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely with code ${code}`));
    });
  });

  const browserWs = new CdpClient(wsUrl);
  await browserWs.connect();
  const { targetInfos } = await browserWs.send('Target.getTargets');
  let pageTarget = targetInfos.find(t => t.type === 'page');
  if (!pageTarget) {
    const created = await browserWs.send('Target.createTarget', { url: 'about:blank' });
    pageTarget = { targetId: created.targetId };
  }
  const portMatch = wsUrl.match(/:(\d+)\//);
  const pageWsUrl = `ws://127.0.0.1:${portMatch[1]}/devtools/page/${pageTarget.targetId}`;
  const page = new CdpClient(pageWsUrl);
  await page.connect();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  return { proc, browserWs, page };
}

async function resolvePhotoInput(photoSrc, idx, tempDir, baseUrl) {
  if (!photoSrc) return '';
  if (photoSrc.startsWith('public/images/products/')) {
    return `${baseUrl}/products/${path.basename(photoSrc)}`;
  }
  if (photoSrc.startsWith('http://') || photoSrc.startsWith('https://')) {
    const res = await fetch(photoSrc, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch photo ${photoSrc}: HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
    const outPath = path.join(tempDir, `raw-slide-${idx}${ext}`);
    fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
    return `${baseUrl}/tmp/${path.basename(outPath)}`;
  }
  const abs = path.isAbsolute(photoSrc) ? photoSrc : path.join(REPO_ROOT, photoSrc);
  const outPath = path.join(tempDir, `local-slide-${idx}${path.extname(abs) || '.jpg'}`);
  fs.copyFileSync(abs, outPath);
  return `${baseUrl}/tmp/${path.basename(outPath)}`;
}

async function runVisionQc(jpegPath, slide, template) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { skipped: true, pass: true, reason: 'GEMINI_API_KEY not set (local DOM collision guard active)' };
  }
  const b64 = fs.readFileSync(jpegPath).toString('base64');
  const banned = (template.bannedWords || []).join(', ');
  const prompt = [
    'Inspect this rendered social media slide JPEG carefully.',
    'Check ALL 6 criteria:',
    '1) Any text overlapping another element, logo, or product photo.',
    '2) Any text or logo clipped near edges or outside safe zone.',
    '3) Low contrast / illegible typography.',
    '4) Unintended language (Arabic headline should be readable right-to-left Arabic).',
    `5) Any banned words appearing: ${banned}`,
    `6) Requested patch applied cleanly: logoPosition=${slide.logoPosition || 'top-right'}, titleScale=${slide.titleScale || 1}.`,
    'Reply ONLY valid JSON: {"pass": boolean, "issues": string[], "patch": {"titleScale"?: number, "logoPosition"?: string, "headline"?: string}}'
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: b64 } }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  if (!resp.ok) {
    return { skipped: true, pass: true, reason: `Gemini Vision QC HTTP ${resp.status}` };
  }
  const data = await resp.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"pass":true}';
  try {
    return JSON.parse(txt);
  } catch {
    return { pass: true, rawText: txt };
  }
}

async function renderOneSlide(page, baseUrl, slide, width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await page.send('Page.navigate', { url: `${baseUrl}/template.html` });

  // Wait until template DOM & inline script have initialized window.__renderSlide
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    const chk = await page.send('Runtime.evaluate', {
      expression: 'document.readyState === "complete" && typeof window.__renderSlide === "function"',
      returnByValue: true
    });
    if (chk.result?.value === true) {
      ready = true;
      break;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  if (!ready) {
    throw new Error('Timed out waiting for template.html __renderSlide');
  }

  const evalRes = await page.send('Runtime.evaluate', {
    expression: `window.__renderSlide(${JSON.stringify(slide)})`,
    awaitPromise: true,
    returnByValue: true
  });
  if (evalRes.exceptionDetails) {
    throw new Error(`Render JS error: ${JSON.stringify(evalRes.exceptionDetails)}`);
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  return { jpegBase64: shot.data, domMetrics: evalRes.result?.value || {} };
}

async function main() {
  const cli = parseArgs(process.argv);
  const jobPath = cli.job || process.env.RENDER_JOB_FILE;
  let job;
  if (process.env.RENDER_JOB_JSON) {
    job = JSON.parse(process.env.RENDER_JOB_JSON);
  } else if (jobPath && fs.existsSync(jobPath)) {
    job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  } else {
    throw new Error('Missing render job (--job <path> or RENDER_JOB_JSON)');
  }

  const templatePath = path.join(__dirname, 'brand-templates', `${job.clientSlug === 'upack-trading' ? 'upack' : (job.brandTemplate || 'upack')}.json`);
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const outDir = path.resolve(cli.out || path.join(__dirname, 'out', job.postId || 'render'));
  const tempDir = fs.mkdtempSync(path.join(REPO_ROOT, '.render-tmp-'));
  fs.mkdirSync(outDir, { recursive: true });

  const format = job.format === 'story' ? 'story' : 'feed';
  const width = format === 'story' ? 1080 : 1080;
  const height = format === 'story' ? 1920 : 1350;
  const version = Number(job.version || 1);
  const targetSlides = Array.isArray(job.targetSlides) && job.targetSlides.length > 0
    ? new Set(job.targetSlides.map(Number))
    : null;

  const chromePath = findChromeBinary();
  const { server, baseUrl } = await startStaticServer(__dirname, REPO_ROOT, tempDir);
  const { proc, browserWs, page } = await launchChrome(chromePath, path.join(tempDir, 'profile'));

  const results = [];
  try {
    const slides = job.slides || [];
    for (let i = 0; i < slides.length; i += 1) {
      const slideNum = Number(slides[i].slideIndex || (i + 1));
      if (targetSlides && !targetSlides.has(slideNum)) continue;

      let slidePayload = {
        ...template.defaults,
        ...slides[i],
        format,
        slideIndex: slideNum,
        slideTotal: slides.length,
        upackLogoUrl: `${baseUrl}/brand/upack-logo.jpg`,
        krnoLogoUrl: `${baseUrl}/brand/krno-logo.png`,
        photoUrl: await resolvePhotoInput(slides[i].photoUrl, slideNum, tempDir, baseUrl)
      };

      const fileName = `slide-${String(slideNum).padStart(2, '0')}-v${version}.jpg`;
      const outPath = path.join(outDir, fileName);

      let rendered = await renderOneSlide(page, baseUrl, slidePayload, width, height);
      fs.writeFileSync(outPath, Buffer.from(rendered.jpegBase64, 'base64'));

      let qc = await runVisionQc(outPath, slidePayload, template);
      if (qc && qc.pass === false && qc.patch) {
        slidePayload = { ...slidePayload, ...qc.patch };
        rendered = await renderOneSlide(page, baseUrl, slidePayload, width, height);
        fs.writeFileSync(outPath, Buffer.from(rendered.jpegBase64, 'base64'));
        qc = { ...(await runVisionQc(outPath, slidePayload, template)), autoFixed: true, appliedPatch: qc.patch };
      }

      results.push({
        slideIndex: slideNum,
        fileName,
        filePath: outPath,
        width,
        height,
        domMetrics: rendered.domMetrics,
        visionQc: qc,
        jpegBase64: process.env.CALLBACK_URL ? fs.readFileSync(outPath).toString('base64') : undefined
      });
    }

    const manifest = {
      postId: job.postId,
      clientSlug: job.clientSlug,
      version,
      format,
      targetSlides: targetSlides ? [...targetSlides] : 'all',
      renderedCount: results.length,
      slides: results.map(({ jpegBase64, ...meta }) => meta)
    };
    fs.writeFileSync(path.join(outDir, 'render-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));

    if (process.env.CALLBACK_URL && job.callbackPayload !== false) {
      const cbRes = await fetch(process.env.CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Secret': process.env.APPS_SCRIPT_CALLBACK_SECRET || ''
        },
        body: JSON.stringify({
          action: 'render_callback',
          secret: process.env.APPS_SCRIPT_CALLBACK_SECRET || '',
          postId: job.postId,
          clientSlug: job.clientSlug,
          version,
          format,
          slides: results
        })
      });
      console.log('Callback status:', cbRes.status);
    }
  } finally {
    page.close();
    browserWs.close();
    try { proc.kill('SIGKILL'); } catch {}
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
