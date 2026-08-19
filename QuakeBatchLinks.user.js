// ==UserScript==
// @name         QuakeBatchLinks
// @name:zh-CN   Quake 批量链接工具
// @namespace    https://github.com/k1115h0t/QuakeBatchLinks
// @version      1.2.1
// @license      GPL-3.0-only
// @description  Batch open/copy Quake result links via passive response monitoring, asset-level deduplication, and local URL fallback.
// @description:zh-CN 被动读取 Quake Web 已有搜索响应，按资产去重并批量打开/复制链接；http_load_url 缺失时可基于同一响应本地补全，不主动发送或重放 Quake API 请求。
// @homepageURL  https://github.com/k1115h0t/QuakeBatchLinks
// @supportURL   https://github.com/k1115h0t/QuakeBatchLinks/issues
// @updateURL    https://raw.githubusercontent.com/k1115h0t/QuakeBatchLinks/main/QuakeBatchLinks.user.js
// @downloadURL  https://raw.githubusercontent.com/k1115h0t/QuakeBatchLinks/main/QuakeBatchLinks.user.js
// @match        https://quake.360.net/quake/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_openInTab
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  'use strict';

  const ORIGIN = 'https://quake.360.net';
  const PATH = '/api/search/query_string/quake_service';
  const OPEN_CONFIRM = 25;
  const OPEN_DELAY = 60;
  const MAX_DECLARED_BYTES = 16 * 1024 * 1024;
  const W = unsafeWindow;

  let currentAssets = [];
  let stats = emptyStats();
  let latestStarted = 0;
  let latestApplied = 0;
  let ui = null;

  function emptyStats() {
    return { raw: 0, assets: 0, dedup: 0, links: 0, fallback: 0, noLink: 0, invalid: 0 };
  }

  function requestUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, W.location.href);
      if (input && typeof input.url === 'string') return new URL(input.url, W.location.href);
    } catch (_) {}
    return null;
  }

  function isTarget(input, method) {
    const u = requestUrl(input);
    return !!u &&
      String(method || 'GET').toUpperCase() === 'POST' &&
      u.origin === ORIGIN &&
      u.pathname === PATH;
  }

  function fetchMethod(input, init) {
    return init?.method || input?.method || 'GET';
  }

  function assetKey(row, index) {
    if (typeof row?.id === 'string' && row.id.trim()) return `id:${row.id.trim()}`;

    const parts = [row?.ip, row?.domain, row?.port, row?.transport, row?.service?.name]
      .map(v => String(v ?? '').trim());

    return parts.some(Boolean)
      ? `fallback:${parts.join('|')}`
      : `row:${index}`;
  }

  function normalizeUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const u = new URL(value.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      u.hash = '';
      return u.href;
    } catch (_) {
      return null;
    }
  }

  function protocolFromService(row) {
    const name = String(row?.service?.name || '').trim().toLowerCase();

    if (
      name === 'https' ||
      name === 'http/ssl' ||
      (name.includes('http') && (name.includes('ssl') || name.includes('tls')))
    ) {
      return 'https';
    }

    if (name === 'http' || name.startsWith('http/')) {
      return 'http';
    }

    return null;
  }

  function parseHost(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    const text = value.trim();

    try {
      const probe = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
        ? new URL(text)
        : new URL(`http://${text}`);

      return probe.hostname || null;
    } catch (_) {
      return null;
    }
  }

  function buildFallback(row) {
    const protocol = protocolFromService(row);
    if (!protocol) return null;

    const candidates = [
      ['service.http.host', row?.service?.http?.host],
      ['domain', row?.domain],
      ['ip', row?.ip]
    ];

    let host = null;
    let source = null;

    for (const [label, value] of candidates) {
      host = parseHost(value);
      if (host) {
        source = label;
        break;
      }
    }

    if (!host) return null;

    const port = Number(row?.port);
    const validPort = Number.isInteger(port) && port > 0 && port <= 65535;
    const isDefaultPort =
      (protocol === 'http' && port === 80) ||
      (protocol === 'https' && port === 443);

    const authority = validPort && !isDefaultPort
      ? `${host}:${port}`
      : host;

    const url = normalizeUrl(`${protocol}://${authority}/`);
    if (!url) return null;

    return {
      url,
      source,
      id: String(row?.id ?? ''),
      ip: String(row?.ip ?? ''),
      domain: String(row?.domain ?? ''),
      port: validPort ? port : null,
      service: String(row?.service?.name ?? '')
    };
  }

  function extract(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const map = new Map();
    let invalid = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = assetKey(row, i);

      let entry = map.get(key);
      if (!entry) {
        entry = { urls: new Set(), fallback: null };
        map.set(key, entry);
      }

      const rawUrls = row?.service?.http?.http_load_url;
      if (Array.isArray(rawUrls)) {
        for (const raw of rawUrls) {
          const url = normalizeUrl(raw);
          if (url) entry.urls.add(url);
          else invalid++;
        }
      }

      if (!entry.fallback) {
        entry.fallback = buildFallback(row);
      }
    }

    const assets = [];
    const fallbackDetails = [];
    let links = 0;
    let fallback = 0;
    let noLink = 0;

    for (const entry of map.values()) {
      if (entry.urls.size === 0 && entry.fallback?.url) {
        entry.urls.add(entry.fallback.url);
        fallback++;
        fallbackDetails.push(entry.fallback);
      }

      const urls = Array.from(entry.urls);
      if (urls.length) links += urls.length;
      else noLink++;

      assets.push(urls);
    }

    return {
      assets,
      fallbackDetails,
      stats: {
        raw: rows.length,
        assets: map.size,
        dedup: rows.length - map.size,
        links,
        fallback,
        noLink,
        invalid
      }
    };
  }

  function applyPayload(payload, seq, source) {
    if (seq !== latestStarted || seq < latestApplied) return;

    if (typeof payload?.code === 'number' && payload.code !== 0) {
      updateUi(null, `搜索响应 code=${payload.code}，未更新`, true);
      return;
    }

    const next = extract(payload);

    currentAssets = next.assets;
    stats = next.stats;
    latestApplied = seq;

    if (next.fallbackDetails.length) {
      console.info('[QuakeBatchLinks] locally completed URL(s) from the existing response:', next.fallbackDetails);
    }

    updateUi(stats, `已捕获当前搜索响应 · ${source}`, false);
  }

  async function inspectFetch(response, seq) {
    let clone = null;
    let payload = null;

    try {
      if (!response?.ok) return;

      const ct = response.headers?.get?.('content-type') || '';
      if (ct && !ct.toLowerCase().includes('application/json')) return;

      const len = Number(response.headers?.get?.('content-length') || 0);
      if (len > MAX_DECLARED_BYTES) return;

      clone = response.clone();
      payload = await clone.json();
      applyPayload(payload, seq, 'fetch');
    } catch (e) {
      console.debug('[QuakeBatchLinks] fetch parse skipped:', e);
    } finally {
      payload = null;
      clone = null;
    }
  }

  function hookFetch() {
    const original = W.fetch;
    if (typeof original !== 'function') return false;
    if (original.__qblWrapped) return true;

    function wrapped(input, init) {
      const target = isTarget(input, fetchMethod(input, init));
      const seq = target ? ++latestStarted : 0;

      // The original page request is executed exactly once.
      const promise = original.apply(this, arguments);
      if (!target) return promise;

      return promise.then(response => {
        void inspectFetch(response, seq);
        return response;
      });
    }

    Object.defineProperty(wrapped, '__qblWrapped', { value: true });

    try {
      W.fetch = wrapped;
      return true;
    } catch (e) {
      console.warn('[QuakeBatchLinks] fetch hook failed:', e);
      return false;
    }
  }

  function hookXhr() {
    const XHR = W.XMLHttpRequest;
    if (!XHR?.prototype) return false;

    const p = XHR.prototype;
    if (p.open?.__qblWrapped) return true;

    const originalOpen = p.open;
    const originalSend = p.send;
    const meta = new WeakMap();

    function wrappedOpen(method, url) {
      meta.set(this, { target: isTarget(url, method), seq: 0 });
      return originalOpen.apply(this, arguments);
    }

    function wrappedSend() {
      const m = meta.get(this);

      if (m?.target) {
        m.seq = ++latestStarted;
        const xhr = this;

        xhr.addEventListener('load', () => {
          const seq = m.seq;
          meta.delete(xhr);

          queueMicrotask(() => {
            let payload = null;

            try {
              if (seq !== latestStarted || xhr.status < 200 || xhr.status >= 300) return;

              const ct = xhr.getResponseHeader?.('content-type') || '';
              if (ct && !ct.toLowerCase().includes('application/json')) return;

              if (xhr.responseType === 'json') {
                payload = xhr.response;
              } else if (xhr.responseType === '' || xhr.responseType === 'text') {
                if (!xhr.responseText) return;
                payload = JSON.parse(xhr.responseText);
              } else {
                return;
              }

              applyPayload(payload, seq, 'XHR');
            } catch (e) {
              console.debug('[QuakeBatchLinks] XHR parse skipped:', e);
            } finally {
              payload = null;
            }
          });
        }, { once: true });
      }

      // The original page request is executed exactly once.
      return originalSend.apply(this, arguments);
    }

    Object.defineProperty(wrappedOpen, '__qblWrapped', { value: true });

    try {
      p.open = wrappedOpen;
      p.send = wrappedSend;
      return true;
    } catch (e) {
      console.warn('[QuakeBatchLinks] XHR hook failed:', e);
      return false;
    }
  }

  function snapshotUrls() {
    const out = [];

    for (const asset of currentAssets) {
      for (const url of asset) out.push(url);
    }

    return out;
  }

  function copyAll() {
    const urls = snapshotUrls();

    if (!urls.length) {
      return updateUi(null, '当前没有可复制的资产链接', true);
    }

    GM_setClipboard(urls.join('\n'), 'text');
    updateUi(null, `已复制 ${urls.length} 个资产链接`, false);
    urls.length = 0;
  }

  async function openAll() {
    const urls = snapshotUrls();

    if (!urls.length) {
      return updateUi(null, '当前没有可打开的资产链接', true);
    }

    if (
      urls.length >= OPEN_CONFIRM &&
      !W.confirm(
        `即将按资产打开 ${urls.length} 个标签页，是否继续？\n\n` +
        `原始 ${stats.raw} 条 · 唯一资产 ${stats.assets} 个 · 去重 ${stats.dedup} 条 · 补全 ${stats.fallback} 个`
      )
    ) {
      urls.length = 0;
      return;
    }

    updateUi(null, `正在打开 ${urls.length} 个资产链接…`, false);

    for (const url of urls) {
      GM_openInTab(url, { active: false, insert: true, setParent: true });
      if (OPEN_DELAY) await new Promise(resolve => setTimeout(resolve, OPEN_DELAY));
    }

    urls.length = 0;
    updateUi(null, '全部资产链接已提交打开', false);
  }

  function updateUi(nextStats, message, error) {
    if (!ui) return;

    if (nextStats) {
      ui.count.textContent = `${nextStats.assets} 资产`;
      ui.stats.textContent =
        `原始 ${nextStats.raw} · 去重 ${nextStats.dedup} · 链接 ${nextStats.links} · 补全 ${nextStats.fallback} · 无链接 ${nextStats.noLink}`;

      ui.stats.title =
        `原始数据：${nextStats.raw}\n` +
        `唯一资产：${nextStats.assets}\n` +
        `被去重数据：${nextStats.dedup}\n` +
        `可用链接：${nextStats.links}\n` +
        `本地补全链接：${nextStats.fallback}\n` +
        `无链接资产：${nextStats.noLink}\n` +
        `无效 URL：${nextStats.invalid}`;
    }

    if (typeof message === 'string') {
      ui.status.textContent = message;
      ui.status.dataset.error = error ? '1' : '0';
    }

    const enabled = stats.links > 0;
    ui.open.disabled = !enabled;
    ui.copy.disabled = !enabled;
  }

  function createUi() {
    if (ui || !document.body) return;

    const box = document.createElement('div');
    box.id = 'qbl-box';
    box.innerHTML = `
      <div class="qbl-head"><strong>Quake 资产链接工具</strong><span class="qbl-count">0 资产</span></div>
      <div class="qbl-stats">原始 0 · 去重 0 · 链接 0 · 补全 0 · 无链接 0</div>
      <div class="qbl-actions"><button class="qbl-open" disabled>打开全部</button><button class="qbl-copy" disabled>复制全部</button></div>
      <div class="qbl-status">等待 Quake 搜索响应…</div>`;

    const style = document.createElement('style');
    style.textContent = `
      #qbl-box{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:335px;box-sizing:border-box;padding:12px;border:1px solid rgba(0,200,140,.38);border-radius:9px;background:rgba(20,24,26,.96);box-shadow:0 8px 30px rgba(0,0,0,.35);color:#e6e6e6;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      #qbl-box .qbl-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}.qbl-count{color:#22c997}.qbl-stats{margin-bottom:10px;color:#aab5b2;font-size:12px;white-space:nowrap}.qbl-actions{display:flex;gap:8px}
      #qbl-box button{flex:1;padding:8px 6px;border:1px solid rgba(0,200,140,.38);border-radius:6px;background:#073b30;color:#eafff8;cursor:pointer}#qbl-box button:hover:not(:disabled){background:#095440}#qbl-box button:disabled{opacity:.45;cursor:default}
      .qbl-status{min-height:18px;margin-top:8px;color:#a8b0b0;font-size:12px}.qbl-status[data-error="1"]{color:#ff8a8a}`;

    document.documentElement.appendChild(style);
    document.body.appendChild(box);

    ui = {
      count: box.querySelector('.qbl-count'),
      stats: box.querySelector('.qbl-stats'),
      status: box.querySelector('.qbl-status'),
      open: box.querySelector('.qbl-open'),
      copy: box.querySelector('.qbl-copy')
    };

    ui.open.addEventListener('click', openAll);
    ui.copy.addEventListener('click', copyAll);
    updateUi(stats);
  }

  const fetchHooked = hookFetch();
  const xhrHooked = hookXhr();

  if (document.body) createUi();
  else document.addEventListener('DOMContentLoaded', createUi, { once: true });

  console.info(
    '[QuakeBatchLinks] passive hooks:',
    `fetch=${fetchHooked}, xhr=${xhrHooked};`,
    'asset-level dedup + local URL fallback enabled; no extra Quake API request is issued.'
  );
})();