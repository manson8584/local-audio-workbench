

import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const supportedInputs = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".aiff", ".ogg", ".opus"]);
const blockedInputs = new Set([".ncm", ".qmc", ".mflac", ".mgg"]);
const outputProfiles = {
  mp3: { extension: ".mp3", args: ["-codec:a", "libmp3lame", "-q:a", "2"] },
  flac: { extension: ".flac", args: ["-codec:a", "flac"] },
  alac: { extension: ".m4a", args: ["-codec:a", "alac"] },
  wav: { extension: ".wav", args: ["-codec:a", "pcm_s16le"] },
  aac: { extension: ".m4a", args: ["-codec:a", "aac", "-b:a", "256k"] },
  ogg: { extension: ".ogg", args: ["-codec:a", "libvorbis", "-q:a", "5"] }
};

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Audio Workbench</title><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f7f9;color:#17202a}*{box-sizing:border-box}body{margin:0}.shell{width:min(920px,calc(100% - 32px));margin:0 auto;padding:56px 0}.hero{margin-bottom:28px}.eyebrow{color:#4d6985;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:.78rem}h1{font-size:clamp(2rem,4vw,3.5rem);line-height:1;margin:0 0 14px}.lede{max-width:720px;color:#536170;font-size:1.1rem}.panel{background:#fff;border:1px solid #dfe5ec;border-radius:8px;padding:24px;display:grid;gap:18px;box-shadow:0 20px 50px rgb(23 32 42 / 8%)}.status{padding:12px 14px;border-radius:8px;background:#eef6ff;color:#194f82;font-weight:650}label{display:grid;gap:8px;font-weight:700}input,select{width:100%;border:1px solid #cbd5df;border-radius:8px;padding:12px;font:inherit}button{border:0;border-radius:8px;background:#1769e0;color:white;padding:13px 16px;font:inherit;font-weight:800;cursor:pointer}button:disabled{opacity:.6;cursor:wait}pre{margin:0;min-height:140px;max-height:300px;overflow:auto;white-space:pre-wrap;background:#101820;color:#d6f5df;border-radius:8px;padding:16px}.notes{margin-top:28px;color:#536170}.notes h2{margin:22px 0 8px;color:#17202a;font-size:1.1rem}</style></head><body><main class="shell"><section class="hero"><p class="eyebrow">Local-first audio conversion for macOS</p><h1>Local Audio Workbench</h1><p class="lede">Convert personal, unencrypted audio files on your own Mac with FFmpeg. No cloud upload, no DRM removal, no music-service cache decryption.</p></section><section class="panel"><div class="status" id="status">Checking FFmpeg...</div><label>Input file or folder path<input id="input" placeholder="~/Music/source"></label><label>Output folder path<input id="output" placeholder="~/Music/converted"></label><label>Output format<select id="format"><option value="mp3">MP3</option><option value="flac">FLAC</option><option value="alac">ALAC / Apple Lossless</option><option value="wav">WAV</option><option value="aac">AAC</option><option value="ogg">OGG</option></select></label><button id="convert">Convert locally</button><pre id="log" aria-live="polite"></pre></section><section class="notes"><h2>Supported input</h2><p>MP3, FLAC, M4A, AAC, WAV, AIFF, OGG, and OPUS.</p><h2>Important boundary</h2><p>This project intentionally blocks protected/cache formats such as .ncm, .qmc, .mflac, and .mgg.</p></section></main><script>const statusEl=document.querySelector("#status"),inputEl=document.querySelector("#input"),outputEl=document.querySelector("#output"),formatEl=document.querySelector("#format"),buttonEl=document.querySelector("#convert"),logEl=document.querySelector("#log");function writeLog(message){logEl.textContent=message}async function doctor(){const response=await fetch("/api/doctor");const data=await response.json();statusEl.textContent=data.ffmpeg.ok?("Ready: "+data.ffmpeg.version):"FFmpeg was not found. Install it with: brew install ffmpeg"}buttonEl.addEventListener("click",async()=>{buttonEl.disabled=true;writeLog("Starting local conversion...\\n");try{const response=await fetch("/api/convert",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({input:inputEl.value,output:outputEl.value,format:formatEl.value})});const data=await response.json();if(!data.ok)throw new Error(data.error);writeLog(data.logs.join("")+"\\nDone.\\n\\nCreated files:\\n"+data.files.join("\\n"))}catch(error){writeLog("Error: "+error.message)}finally{buttonEl.disabled=false}});doctor().catch(error=>{statusEl.textContent=error.message});</script></body></html>`;

function expandHome(inputPath) {
  if (!inputPath || inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function hasExtension(filePath, extensions) {
  const lower = filePath.toLowerCase();
  return [...extensions].some((ext) => lower.endsWith(ext));
}

function checkFfmpeg() {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return { ok: result.status === 0, version: result.stdout?.split("\n")[0] || "", error: result.stderr || "" };
}

async function collectAudioFiles(inputPath) {
  const expanded = expandHome(inputPath);
  const info = await stat(expanded);
  if (info.isFile()) return [expanded];
  if (!info.isDirectory()) return [];
  const entries = await readdir(expanded, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const childPath = path.join(expanded, entry.name);
    return entry.isDirectory() ? collectAudioFiles(childPath) : [childPath];
  }));
  return nested.flat().filter((file) => hasExtension(file, supportedInputs) || hasExtension(file, blockedInputs));
}

function validateFiles(files) {
  const blocked = files.filter((file) => hasExtension(file, blockedInputs));
  if (blocked.length > 0) throw new Error(`Unsupported protected/cache format detected: ${blocked.map((file) => path.basename(file)).join(", ")}. This project does not decrypt DRM or music-service cache files.`);
  const unsupported = files.filter((file) => !hasExtension(file, supportedInputs));
  if (unsupported.length > 0) throw new Error(`Unsupported file type: ${unsupported.map((file) => path.basename(file)).join(", ")}`);
}

function runFfmpeg(args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    child.stdout.on("data", (chunk) => onLog?.(chunk.toString()));
    child.stderr.on("data", (chunk) => onLog?.(chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
  });
}

async function convertAudio({ input, output, format }, onLog) {
  const profile = outputProfiles[format];
  if (!profile) throw new Error(`Unknown output format: ${format}`);
  if (!input) throw new Error("Input path is required.");
  if (!output) throw new Error("Output folder is required.");
  const ffmpeg = checkFfmpeg();
  if (!ffmpeg.ok) throw new Error("FFmpeg was not found. Install it with: brew install ffmpeg");
  const outputDir = expandHome(output);
  await mkdir(outputDir, { recursive: true });
  const files = await collectAudioFiles(input);
  validateFiles(files);
  const converted = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const target = path.join(outputDir, `${base}${profile.extension}`);
    onLog?.(`Converting ${path.basename(file)} -> ${path.basename(target)}\n`);
    await runFfmpeg(["-y", "-i", file, ...profile.args, target], onLog);
    converted.push(target);
  }
  return converted;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handle(req, res) {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
      return;
    }
    if (req.method === "GET" && req.url === "/api/doctor") {
      sendJson(res, 200, { ffmpeg: checkFfmpeg(), formats: Object.keys(outputProfiles) });
      return;
    }
    if (req.method === "POST" && req.url === "/api/convert") {
      const body = await readJson(req);
      const logs = [];
      const files = await convertAudio(body, (line) => logs.push(line));
      sendJson(res, 200, { ok: true, files, logs: logs.slice(-80) });
      return;
    }
    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

if (process.argv.includes("--doctor")) {
  const ffmpeg = checkFfmpeg();
  console.log(ffmpeg.ok ? ffmpeg.version : "FFmpeg was not found. Install it with: brew install ffmpeg");
  process.exit(ffmpeg.ok ? 0 : 1);
}

const port = Number(process.env.PORT || 4178);
createServer(handle).listen(port, "127.0.0.1", () => {
  console.log(`Local Audio Workbench is running at http://127.0.0.1:${port}`);
});
