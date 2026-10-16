// Network-level ad / tracker / popunder blocklist. Requests matching any of
// these are answered with an empty 204 so the ad never loads (which also stops
// most pop-under/pop-up scripts, since they're served by these same domains).
// abackflannel.com: display banners allowed; its popunder/social-bar URLs blocked — see isAdBlocked.
const ADBLOCK_PATTERNS = [
    // Google ads (NOTE: GA / Tag Manager left out so the site's own analytics work)
    "googlesyndication.com", "googleadservices.com", "doubleclick.net",
    "pagead2.googlesyndication", "adservice.google", "googletagservices.com",
    // Major ad exchanges / SSPs
    "adnxs.com", "amazon-adsystem.com", "rubiconproject.com", "pubmatic.com",
    "criteo.com", "criteo.net", "openx.net", "taboola.com", "outbrain.com",
    "moatads.com", "casalemedia.com", "adsafeprotected.com", "smartadserver.com",
    "yieldmo.com", "sharethrough.com", "gumgum.com", "33across.com", "indexww.com",
    "contextweb.com", "bidswitch.net", "adform.net", "teads.tv", "spotxchange.com",
    "districtm.io", "media.net", "adroll.com", "bluekai.com", "rlcdn.com",
    // Trackers / analytics
    "chartbeat.com", "scorecardresearch.com", "quantserve.com", "quantcount.com",
    "krxd.net", "demdex.net", "advertising.com", "adtechus.com", "hotjar.com",
    "mouseflow.com", "fullstory.com", "mixpanel.com", "segment.io", "branch.io",
    "newrelic.com/agent", "nr-data.net", "sentry.io",
    // Social trackers
    "facebook.com/tr", "facebook.com/ads", "graph.facebook.com/pixel",
    "connect.facebook.net", "ads-api.twitter.com", "analytics.twitter.com",
    "ads.tiktok.com", "analytics.tiktok.com", "snap.licdn.com", "ads.linkedin.com",
    "popads.net", "popcash.net", "popmyads.com", "propellerads.com", "propellerclick",
    "hilltopads.net", "hilltopads.com", "adsterra.com", "adsterra.net",
    "onclickads.net", "onclkds.com", "clickadu.com", "exoclick.com", "exosrv.com",
    "juicyads.com", "trafficjunky.com", "trafficstars.com", "popunder",
    "adcash.com", "admaven", "ad-maven", "mgid.com", "revcontent.com",
    "bidvertiser.com", "clicksor.com", "adhood.com", "zeropark.com", "voluumtrk",
    "luckyforbet", "go.pubpush", "pushwhy", "richaudience.com", "vidoomy.com",
    // YouTube ads
    "youtube.com/api/stats/ads", "youtube.com/pagead", "youtube.com/get_midroll",
    "youtube.com/ptracking", "./api/stats/qoe?adformat",
    // Extra popunder / push / redirect networks (common on streaming & piracy sites)
    "propu.sh", "poptm.com", "onclickads.net", "monetag.com", "datrk.io",
    "clickaine.com", "highperformanceformat", "yllix.com", "clksite.com",
    "adservetx.media", "pushnest", "a.realsrv.com", "syndication.realsrv.com",
    "creativecdn.com", "adskeeper.com", "servedbyadbutler", "zedo.com", "2mdn.net",
    "trafficjunky.net", "go.ataxoo", "bridgeurl", "yllix",
    // Generic path patterns — catch ads by URL shape regardless of host
    "./pagead/", "./ptracking", "./popunder", "./pop.js", "./push-sw", "./adframe",
    "./advert", "ad-banner", "_ads.js", "./api/stats/ads",
    // Game / app ad SDKs
    "unityads.unity3d.com",
];

function isAdBlocked(url) {
    const urlStr = url.toString();
    if (urlStr.includes("abackflannel.com")) {
        // allow display banners; block the popunder / social-bar scripts
        return /r6bfw001|xu958ru8t|chy5u902|f38133548e2766a7c11324475f18cd67|be5516bd551f013bae48ace54ad82177/.test(urlStr);
    }
    return ADBLOCK_PATTERNS.some(p => urlStr.includes(p));
}

if (navigator.userAgent.includes('Firefox')) {
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, writable: false });
}

const ENGINE_PREFIX = "./cdn/";

self.$scramjet = {
    files: {
        wasm: "./sj/core.wasm",
        sync: "./sj/sync.js",
    }
};

importScripts("./sj/core.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const eng = new ScramjetServiceWorker({ prefix: ENGINE_PREFIX });

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

let wispConfig = { wispurl: null, servers: [], autoswitch: true };

async function pingServer(url) {
    return new Promise(resolve => {
        const start = Date.now();
        try {
            const ws = new WebSocket(url);
            const t = setTimeout(() => { try { ws.close(); } catch {} resolve({ url, success: false, latency: null }); }, 3000);
            ws.onopen = () => { clearTimeout(t); try { ws.close(); } catch {} resolve({ url, success: true, latency: Date.now() - start }); };
            ws.onerror = () => { clearTimeout(t); resolve({ url, success: false, latency: null }); };
        } catch { resolve({ url, success: false, latency: null }); }
    });
}

function notifyClients(msg) {
    self.clients.matchAll().then(clients => clients.forEach(c => c.postMessage(msg)));
}

async function proactiveCheck() {
    if (!wispConfig.autoswitch || !wispConfig.servers?.length) return;
    const results = await Promise.all(wispConfig.servers.map(s => pingServer(s.url)));
    const currentOk = results.find(r => r.url === wispConfig.wispurl)?.success;
    if (!currentOk) {
        const best = results.filter(r => r.success).sort((a,b) => a.latency - b.latency)[0];
        if (best) {
            wispConfig.wispurl = best.url;
            notifyClients({ type: 'wispChanged', url: best.url, name: wispConfig.servers.find(s => s.url === best.url)?.name || 'Server', latency: best.latency });
        }
    }
}

self.addEventListener("message", ({ data }) => {
    if (data.type === "config") {
        if (data.wispurl) wispConfig.wispurl = data.wispurl;
        if (data.servers?.length) { wispConfig.servers = data.servers; if (wispConfig.autoswitch) setTimeout(proactiveCheck, 500); }
        if (typeof data.autoswitch !== 'undefined') wispConfig.autoswitch = data.autoswitch;
    } else if (data.type === "ping") {
        pingServer(wispConfig.wispurl).then(result => notifyClients({ type: 'pingResult', ...result }));
    }
});

async function handleEngine(event) {
    try {
        await eng.loadConfig();
    } catch (err) {
        console.warn('[sw] loadConfig fallback:', err);
    }
    try {
        if (eng.route(event)) return eng.fetch(event);
    } catch (err) {
        console.warn('[sw] route fallback:', err);
    }
    return fetch(event.request);
}

self.addEventListener("fetch", event => {
    const reqUrl = event.request.url;
    if (isAdBlocked(reqUrl)) {
        event.respondWith(new Response(null, { status: 204 }));
        return;
    }
    let path = "";
    try { path = new URL(reqUrl).pathname; } catch {}
    if (path.startsWith("./triple/hd/") || path.startsWith("./e/") || path.startsWith("./sj/")  || path.startsWith("./wk.js")) return;
    event.respondWith(handleEngine(event));
});