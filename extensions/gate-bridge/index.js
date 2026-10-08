/**
 * SmartVision gate bridge
 *
 * Real-time companion to the folder-watch cron in pb_hooks. It reads the
 * `gate_triggers` collection and, for every enabled trigger:
 *
 *   - folder_watch: watches `watch_folder` with fs notifications (chokidar) and,
 *     the instant a matching image lands, extracts the plate from the filename
 *     and forwards it. The processed file is then deleted or moved, matching the
 *     cron engine's behaviour.
 *   - tcp_socket: listens on `tcp_host:tcp_port`, splits the stream on
 *     `tcp_delimiter`, extracts the plate from each message and forwards it.
 *
 * Detections are POSTed to the existing route:
 *   POST {PB_URL}/api/gate-event  { gate_id, plate_number }
 * which performs the same vehicle lookup / access creation and guards.
 *
 * The 1-minute cron in pb_hooks stays as a safety-net sweep for anything the
 * bridge misses (e.g. while it is restarting).
 *
 * Requires Node >= 18 (global fetch). Run: `npm install && npm start`.
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Minimal .env loader (avoids a dotenv dependency) ----------------------
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const PB_URL = (process.env.PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const PB_IDENTITY = process.env.PB_IDENTITY || '';
const PB_PASSWORD = process.env.PB_PASSWORD || '';
const PB_AUTH_COLLECTION = process.env.PB_AUTH_COLLECTION || 'users';
const CONFIG_POLL_MS = Math.max(5, Number(process.env.CONFIG_POLL_SECONDS || 15)) * 1000;

const DEFAULT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp'];

// --- Auth ------------------------------------------------------------------
let authToken = '';

async function authenticate() {
  const res = await fetch(`${PB_URL}/api/collections/${PB_AUTH_COLLECTION}/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_IDENTITY, password: PB_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`auth failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  authToken = data.token;
  log('authenticated as', PB_IDENTITY);
}

/** fetch wrapper that attaches the auth token and re-authenticates once on 401. */
async function apiFetch(pathname, options = {}, retry = true) {
  const res = await fetch(`${PB_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authToken,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && retry) {
    await authenticate();
    return apiFetch(pathname, options, false);
  }
  return res;
}

// --- Config ----------------------------------------------------------------
async function fetchTriggers() {
  const params = new URLSearchParams({
    perPage: '500',
    filter: 'enabled = true',
    expand: 'gate',
  });
  const res = await apiFetch(`/api/collections/gate_triggers/records?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`failed to load triggers: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.items || [];
}

// --- Plate helpers (mirror pb_hooks/lib/gate_trigger_engine.js) ------------
function buildPlateRegex(pattern) {
  const p = (pattern || '').trim();
  if (!p) {
    return /([A-Z0-9]{4,10})/i;
  }
  try {
    return new RegExp(p, 'i');
  } catch (err) {
    log('invalid plate_regex, using default:', p, String(err));
    return /([A-Z0-9]{4,10})/i;
  }
}

function normalizePlate(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractPlate(regex, source) {
  const match = regex.exec(source);
  if (!match) {
    return '';
  }
  const raw = match[1] != null ? match[1] : match[0];
  return normalizePlate(raw);
}

function parseExtensions(raw) {
  const s = (raw || '').trim();
  if (!s) {
    return DEFAULT_EXTENSIONS.slice();
  }
  return s
    .split(',')
    .map((x) => x.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
}

function fileExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Turns a stored delimiter like "\\n" into the real control character. */
function unescapeDelimiter(raw) {
  const s = raw == null || raw === '' ? '\\n' : String(raw);
  return s
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

// --- Detection forwarding --------------------------------------------------
async function forwardDetection(gateExternalId, plate) {
  if (!gateExternalId || !plate) {
    return false;
  }
  try {
    const res = await apiFetch('/api/gate-event', {
      method: 'POST',
      body: JSON.stringify({ gate_id: gateExternalId, plate_number: plate }),
    });
    if (!res.ok) {
      log('gate-event rejected', res.status, await res.text());
      return false;
    }
    log('detection forwarded', gateExternalId, plate);
    return true;
  } catch (err) {
    log('failed to forward detection', String(err));
    return false;
  }
}

function disposeFile(fullPath, action, processedFolder) {
  try {
    if (action === 'move' && processedFolder) {
      fs.mkdirSync(processedFolder, { recursive: true });
      const dst = path.join(processedFolder, `${Date.now()}_${path.basename(fullPath)}`);
      fs.renameSync(fullPath, dst);
    } else {
      fs.rmSync(fullPath, { force: true });
    }
  } catch (err) {
    log('failed to dispose file', fullPath, String(err));
  }
}

// --- Runtime registries ----------------------------------------------------
/** triggerId -> { signature, watcher } */
const folderWatchers = new Map();
/** "host:port" -> { signature, server, sockets:Set } */
const tcpServers = new Map();

function gateExternalId(trigger) {
  return trigger?.expand?.gate?.gate_id || '';
}

function folderSignature(t) {
  return JSON.stringify([
    t.watch_folder, t.file_extensions, t.plate_regex,
    t.processed_action, t.processed_folder, gateExternalId(t),
  ]);
}

function tcpSignature(t) {
  return JSON.stringify([t.tcp_host, t.tcp_port, t.tcp_delimiter, t.plate_regex, gateExternalId(t)]);
}

function startFolderWatcher(trigger) {
  const folder = (trigger.watch_folder || '').trim();
  const gid = gateExternalId(trigger);
  if (!folder || !gid) {
    log('skipping folder trigger (missing folder or gate.gate_id):', trigger.name);
    return null;
  }

  const extensions = parseExtensions(trigger.file_extensions);
  const regex = buildPlateRegex(trigger.plate_regex);
  const action = trigger.processed_action || 'delete';
  const processedFolder = (trigger.processed_folder || '').trim();

  const watcher = chokidar.watch(folder, {
    ignoreInitial: false, // process any backlog already in the folder on start
    depth: 0,
    // Don't react to files we just moved into the processed subfolder.
    ignored: processedFolder ? path.join(processedFolder, '**') : undefined,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', async (fullPath) => {
    const name = path.basename(fullPath);
    if (extensions.length > 0 && extensions.indexOf(fileExtension(name)) === -1) {
      return;
    }
    const plate = extractPlate(regex, name);
    if (!plate) {
      log('no plate extracted from filename:', name);
      return;
    }
    const ok = await forwardDetection(gid, plate);
    if (ok) {
      disposeFile(fullPath, action, processedFolder);
    }
  });

  watcher.on('error', (err) => log('folder watcher error', folder, String(err)));
  log('watching folder', folder, '->', gid);
  return watcher;
}

function startTcpServer(trigger) {
  const host = (trigger.tcp_host || '0.0.0.0').trim();
  const port = Number(trigger.tcp_port);
  const gid = gateExternalId(trigger);
  if (!port || !gid) {
    log('skipping tcp trigger (missing port or gate.gate_id):', trigger.name);
    return null;
  }

  const regex = buildPlateRegex(trigger.plate_regex);
  const delimiter = unescapeDelimiter(trigger.tcp_delimiter);
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', async (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf(delimiter)) !== -1) {
        const message = buffer.slice(0, idx);
        buffer = buffer.slice(idx + delimiter.length);
        const plate = extractPlate(regex, message);
        if (plate) {
          await forwardDetection(gid, plate);
        } else {
          log('no plate extracted from tcp message');
        }
      }
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });

  server.on('error', (err) => log('tcp server error', `${host}:${port}`, String(err)));
  server.listen(port, host, () => log('listening on', `${host}:${port}`, '->', gid));
  return { server, sockets };
}

function stopFolderWatcher(entry) {
  try {
    entry.watcher.close();
  } catch { /* noop */ }
}

function stopTcpServer(entry) {
  try {
    for (const socket of entry.sockets) {
      socket.destroy();
    }
    entry.server.close();
  } catch { /* noop */ }
}

/** Reconciles live watchers/servers against the latest trigger config. */
function reconcile(triggers) {
  const folderSeen = new Set();
  const tcpSeen = new Set();

  for (const trigger of triggers) {
    if (trigger.type === 'folder_watch') {
      const sig = folderSignature(trigger);
      const existing = folderWatchers.get(trigger.id);
      folderSeen.add(trigger.id);
      if (existing && existing.signature === sig) {
        continue;
      }
      if (existing) {
        stopFolderWatcher(existing);
      }
      const watcher = startFolderWatcher(trigger);
      if (watcher) {
        folderWatchers.set(trigger.id, { signature: sig, watcher });
      } else {
        folderWatchers.delete(trigger.id);
      }
    } else if (trigger.type === 'tcp_socket') {
      const key = `${(trigger.tcp_host || '0.0.0.0').trim()}:${Number(trigger.tcp_port)}`;
      const sig = tcpSignature(trigger);
      const existing = tcpServers.get(key);
      tcpSeen.add(key);
      if (existing && existing.signature === sig) {
        continue;
      }
      if (existing) {
        stopTcpServer(existing);
      }
      const started = startTcpServer(trigger);
      if (started) {
        tcpServers.set(key, { signature: sig, ...started });
      } else {
        tcpServers.delete(key);
      }
    }
  }

  // Tear down anything no longer present / enabled.
  for (const [id, entry] of folderWatchers) {
    if (!folderSeen.has(id)) {
      stopFolderWatcher(entry);
      folderWatchers.delete(id);
      log('stopped folder watcher', id);
    }
  }
  for (const [key, entry] of tcpServers) {
    if (!tcpSeen.has(key)) {
      stopTcpServer(entry);
      tcpServers.delete(key);
      log('stopped tcp server', key);
    }
  }
}

// --- Main loop -------------------------------------------------------------
async function refreshConfig() {
  try {
    const triggers = await fetchTriggers();
    reconcile(triggers);
  } catch (err) {
    log('config refresh failed', String(err));
  }
}

function log(...args) {
  console.log(`[gate-bridge ${new Date().toISOString()}]`, ...args);
}

async function main() {
  if (!PB_IDENTITY || !PB_PASSWORD) {
    console.error('PB_IDENTITY and PB_PASSWORD are required (see .env.example)');
    process.exit(1);
  }

  log('starting against', PB_URL);
  await authenticate();
  await refreshConfig();
  setInterval(refreshConfig, CONFIG_POLL_MS);

  const shutdown = () => {
    log('shutting down');
    for (const entry of folderWatchers.values()) stopFolderWatcher(entry);
    for (const entry of tcpServers.values()) stopTcpServer(entry);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
