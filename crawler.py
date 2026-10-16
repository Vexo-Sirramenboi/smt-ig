import asyncio
import re
import json
import mimetypes
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag, unquote
from collections import deque

import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

BASE = "https://triplet.mantaaway.com/"
HOST = urlparse(BASE).netloc
ROOT = Path(".")

visited = set()
queued = set()
queue = deque([BASE])
failures = []
session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0"

ASSET_EXTENSIONS = {
    ".js", ".mjs", ".css", ".json", ".map",
    ".wasm", ".svg", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".avif", ".ico", ".bmp",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".mp4", ".webm", ".mp3", ".ogg", ".pdf",
    ".xml", ".webmanifest", ".txt", ".bin"
}

def local_path(url):
    parsed = urlparse(url)
    path = unquote(parsed.path).lstrip("/") or "index.html"

    if parsed.query:
        from hashlib import sha256
        suffix = sha256(parsed.query.encode()).hexdigest()[:10]
        p = Path(path)
        path = str(p.with_name(f"{p.stem}_{suffix}{p.suffix}"))

    return Path(path)

def allowed(url):
    parsed = urlparse(url)
    return (
        parsed.scheme in ("http", "https")
        and parsed.netloc == HOST
    )

def normalize(url, base):
    url = urldefrag(urljoin(base, url.strip()))[0]
    return url.rstrip("#")

def add(url, base):
    url = normalize(url, base)

    if not allowed(url) or url in queued or url in visited:
        return

    queued.add(url)
    queue.append(url)

def discover_text(text, url):
    patterns = [
        r'''(?:src|href|poster|data-src|data-href)\s*=\s*["']([^"']+)["']''',
        r'''url\(\s*["']?([^)'"]+)["']?\s*\)''',
        r'''@import\s+["']([^"']+)["']''',
        r'''(?:import|from)\s*["']([^"']+)["']''',
        r'''import\(\s*["']([^"']+)["']\s*\)''',
        r'''["']([^"']+\.(?:js|mjs|css|json|wasm|woff2?|ttf|svg|png|jpe?g|webp|avif|mp4|webm)(?:\?[^"']*)?)["']''',
    ]

    for pattern in patterns:
        for match in re.findall(pattern, text, re.I):
            if match.startswith((
                "data:", "blob:", "javascript:", "mailto:",
                "tel:", "#"
            )):
                continue
            add(match, url)

def save_response(url, content, content_type):
    target = local_path(url)
    target.parent.mkdir(parents=True, exist_ok=True)

    textual = (
        any(x in content_type.lower() for x in (
            "text/", "javascript", "json", "xml", "svg"
        ))
        or target.suffix.lower() in {
            ".html", ".htm", ".js", ".mjs", ".css",
            ".json", ".xml", ".svg", ".webmanifest", ".txt"
        }
    )

    if textual:
        text = content.decode("utf-8", errors="replace")
        discover_text(text, url)

        # Rewrite root-relative URLs for GitHub Pages project sites.
        # Full cross-site URLs are left unchanged.
        if target.suffix.lower() in {".html", ".htm", ".css", ".js", ".mjs"}:
            text = re.sub(
                r'''(["'(])/(?!/)([^"'()\s]+)''',
                lambda m: m.group(1) + "./" + m.group(2),
                text
            )

        target.write_text(text, encoding="utf-8")
    else:
        target.write_bytes(content)

    print(f"Saved {target}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Discover assets requested by the actual running page.
        async def on_response(response):
            url = response.url
            if not allowed(url):
                return

            add(url, BASE)

            try:
                request = response.request
                if request.resource_type in (
                    "script", "stylesheet", "image", "font",
                    "media", "manifest", "xhr", "fetch", "other"
                ):
                    body = await response.body()
                    content_type = response.headers.get(
                        "content-type", ""
                    )
                    save_response(url, body, content_type)
            except Exception:
                pass

        page.on("response", on_response)

        try:
            await page.goto(
                BASE,
                wait_until="networkidle",
                timeout=60000
            )
        except Exception as error:
            print(f"Browser navigation warning: {error}")

        # Allow delayed frontend loading and scroll-triggered assets.
        for _ in range(5):
            await page.evaluate(
                "window.scrollTo(0, document.body.scrollHeight)"
            )
            await page.wait_for_timeout(1000)

        try:
            discovered = await page.evaluate("""() => {
              const urls = new Set();
              for (const el of document.querySelectorAll(
                '[src], [href], [poster], [srcset]'
              )) {
                for (const attr of ['src', 'href', 'poster']) {
                  if (el.getAttribute(attr))
                    urls.add(el.getAttribute(attr));
                }
                if (el.srcset) {
                  for (const part of el.srcset.split(',')) {
                    urls.add(part.trim().split(/\\s+/)[0]);
                  }
                }
              }
              for (const entry of performance.getEntriesByType('resource'))
                urls.add(entry.name);
              return [...urls];
            }""")

            for url in discovered:
                add(url, BASE)
        except Exception:
            pass

        await browser.close()

    # Crawl discovered files recursively.
    while queue:
        url = queue.popleft()

        if url in visited:
            continue

        visited.add(url)

        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "")
            save_response(
                response.url,
                response.content,
                content_type
            )

        except Exception as error:
            print(f"Failed: {url} ({error})")
            failures.append(url)

    print(f"\nVisited URLs: {len(visited)}")
    print(f"Failed URLs: {len(failures)}")

    Path("crawl-report.json").write_text(
        json.dumps({
            "visited": sorted(visited),
            "failed": failures
        }, indent=2),
        encoding="utf-8"
    )

    if not Path("index.html").exists():
        raise SystemExit("index.html was not downloaded.")

asyncio.run(main())
