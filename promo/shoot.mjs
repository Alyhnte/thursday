// Renders stills (node shoot.mjs stills 1.5 8.2 ...) or the film (node shoot.mjs film [from] [to] [out])
// through headless Chrome, frames piped to ffmpeg. LANG_FILM=en|ko picks the words; Q=0 skips
// motion blur for a quick look. The browser is CHROME_PATH, else the installed Chrome.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const ROOT = new URL(".", import.meta.url).pathname;
const FFMPEG = join(ROOT, "node_modules/ffmpeg-static/ffmpeg");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const [mode = "stills", ...rest] = process.argv.slice(2);
const lang = process.env.LANG_FILM || "en";
// Without a GPU (a container), WebGL runs in SwiftShader
const SOFTWARE = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"];
const CONTAINER = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : existsSync(CONTAINER)
      ? { executablePath: CONTAINER, args: SOFTWARE }
      : { channel: "chrome" },
);
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("console", (m) => console.log("[page]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(`http://127.0.0.1:${port}/web/index.html?lang=${lang}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
const frame = page.locator("#frame");

if (mode === "stills") {
  const quality = Number(process.env.Q ?? 0);
  for (const t of rest.map(Number)) {
    const started = Date.now();
    const samples = await page.evaluate(([t, q]) => window.renderAt(t, { quality: q }), [t, quality]);
    await mkdir(join(ROOT, "stills"), { recursive: true });
    await frame.screenshot({ path: join(ROOT, `stills/${lang}-${t.toFixed(2)}.png`) });
    console.log(`t=${t} samples=${samples} ${Date.now() - started}ms`);
  }
} else if (mode === "film") {
  const TL = JSON.parse(await readFile(join(ROOT, "timeline.json"), "utf8"));
  const fps = TL.fps;
  const from = Number(rest[0] ?? 0);
  const to = Number(rest[1] ?? TL.duration);
  const out = rest[2] ?? join(ROOT, `renders/${lang}.mp4`);
  await mkdir(join(ROOT, "renders"), { recursive: true });
  const quality = Number(process.env.Q ?? 1);
  const ff = spawn(FFMPEG, [
    "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p", "-r", String(fps), out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const first = Math.round(from * fps);
  const last = Math.round(to * fps);
  const started = Date.now();
  for (let i = first; i < last; i++) {
    const t = i / fps;
    await page.evaluate(([t, q]) => window.renderAt(t, { quality: q }), [t, quality]);
    const png = await frame.screenshot({ type: "png" });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 30 === 0) console.log(`frame ${i}/${last} t=${t.toFixed(2)} ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
await browser.close();
server.close();
