importScripts("./e/bundle.js");
importScripts("./e/config.js");
importScripts(__uv$config.sw || "./e/worker.js");

const uv = new UVServiceWorker();

const ADBLOCK = [
  // Display/programmatic
  "googlesyndication.com","googleadservices.com","doubleclick.net","adnxs.com",
  "amazon-adsystem.com","rubiconproject.com","pubmatic.com","criteo.com","openx.net",
  "taboola.com","outbrain.com","moatads.com","casalemedia.com","adsafeprotected.com",
  "scorecardresearch.com","quantserve.com","krxd.net","demdex.net","advertising.com",
  "adservice.google","./pagead/","./ptracking","2mdn.net","adsystem","./api/stats/ads",
  "zedo.com","adform.net","yieldmo.com","sharethrough.com","adroll.com","bidswitch.net",
  // Pop-under / push / redirect networks common on streaming & piracy sites
  "popads.net","popcash.net","propellerads.com","propu.sh","propellerclick",
  "adsterra.com","hilltopads.com","hilltopads.net","exoclick.com","exosrv.com",
  "juicyads.com","trafficjunky.com","trafficjunky.net","poptm.com","onclickads.net",
  "clickadu.com","admaven.com","ad-maven.com","mgid.com","revcontent.com","popmyads.com",
  "adskeeper.com","adsterra.net","monetag.com","datrk.io","clickaine.com","luckypushh",
  "highperformanceformat","adcash.com","bidvertiser.com","servedbyadbutler","vidoomy.com",
  "smartadserver.com","yllix.com","clksite.com","adservetx.media","pushwhy","pushnest",
  "a.realsrv.com","syndication.realsrv.com","creativecdn.com","go.ataxoo","bridgeurl",
  // Generic patterns
  "./ads/","./adframe","./advert","./popunder","./pop.js","./push-sw","_ads.js","ad-banner",
  // Game / app ad SDKs
  "unityads.unity3d.com",
];
function isAd(u){ const s=(u||"").toLowerCase(); return ADBLOCK.some(p => s.includes(p)); }

async function handle(event) {
  try {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith(__uv$config.prefix)) {
      let real = "";
      try { real = __uv$config.decodeUrl(url.pathname.slice(__uv$config.prefix.length)); } catch {}
      if (real && isAd(real)) return new Response("", { status: 204 });
    }
  } catch {}
  if (uv.route(event)) return uv.fetch(event);
  return fetch(event.request);
}

self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
