const { app, BrowserWindow, ipcMain, shell, protocol, net: electronNet } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const os = require('os');

let mainWindow;
const LAUNCHER_DIR   = path.join(os.homedir(), '.nova-launcher');
const JAVA_DIR       = path.join(LAUNCHER_DIR, 'java');
const MC_DIR         = path.join(LAUNCHER_DIR, 'minecraft');
const INSTANCES_DIR  = path.join(LAUNCHER_DIR, 'instances');
const PROFILES_FILE  = path.join(LAUNCHER_DIR, 'profiles.json');
const SERVERS_FILE   = path.join(LAUNCHER_DIR, 'servers.json');
const SETTINGS_FILE  = path.join(LAUNCHER_DIR, 'settings.json');

let packageVersion = '3.9.150';
try { packageVersion = require('./package.json').version; } catch {}

async function ensureDirs() {
  await fs.ensureDir(LAUNCHER_DIR);
  await fs.ensureDir(JAVA_DIR);
  await fs.ensureDir(MC_DIR);
  await fs.ensureDir(INSTANCES_DIR);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await ensureDirs();

  // nova:// protocol for serving local files (screenshots, etc.)
  protocol.handle('nova', (request) => {
    const raw = request.url.replace(/^nova:\/\/[^/]*/, '');
    const filePath = decodeURIComponent(raw);
    return electronNet.fetch('file://' + filePath);
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close',    () => app.quit());
ipcMain.on('kill-game', () => {
  if (global._mcProcess) {
    try {
      global._mcProcess.kill('SIGTERM');
      setTimeout(() => { try { global._mcProcess?.kill('SIGKILL'); } catch {} }, 2000);
    } catch {}
    global._mcProcess = null;
  } else {
    // Process not spawned yet — set flag so it gets killed the moment it starts
    global._mcKillPending = true;
  }
});

// ── Minecraft versions ───────────────────────────────────────────────────────
ipcMain.handle('get-versions', async () => {
  return new Promise((resolve, reject) => {
    https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const m = JSON.parse(data);
          resolve({ latest: m.latest, versions: m.versions.map(v => ({ id: v.id, type: v.type, url: v.url })) });
        } catch (e) { reject(e.message); }
      });
    }).on('error', e => reject(e.message));
  });
});

// ── Loader versions ──────────────────────────────────────────────────────────
ipcMain.handle('get-loader-versions', async (_, { loader, mcVersion }) => {
  if (loader === 'fabric') {
    return new Promise((resolve, reject) => {
      https.get(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`,
        { headers: { 'User-Agent': 'nova-launcher/1.0' } }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data).map(e => ({
                id: e.loader.version, stable: e.loader.stable,
                label: `${e.loader.version}${e.loader.stable ? '' : ' (unstable)'}`,
              })));
            } catch (e) { reject(e.message); }
          });
        }).on('error', e => reject(e.message));
    });
  }
  if (loader === 'forge') {
    return new Promise((resolve, reject) => {
      https.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
        { headers: { 'User-Agent': 'nova-launcher/1.0' } }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const promos = JSON.parse(data).promos || {};
              const results = Object.entries(promos)
                .filter(([k]) => k.startsWith(mcVersion + '-'))
                .map(([k, v]) => ({ id: `${mcVersion}-${v}`, label: `${v} (${k.replace(mcVersion + '-', '')})` }));
              resolve(results.length ? results : [{ id: null, label: 'No promoted builds' }]);
            } catch (e) { reject(e.message); }
          });
        }).on('error', e => reject(e.message));
    });
  }
  if (loader === 'optifine') return [{ id: 'manual', label: 'Manual install — place .jar in mods folder' }];
  return [];
});

// ── Settings ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  username: 'Player', ram: 2048, version: '', javaPath: '',
  gameDir: MC_DIR, fullscreen: false, width: 854, height: 480,
};

ipcMain.handle('get-settings', async () => {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS, ...await fs.readJson(SETTINGS_FILE) };
  } catch {}
  return DEFAULT_SETTINGS;
});

ipcMain.handle('save-settings', async (_, s) => {
  await fs.writeJson(SETTINGS_FILE, s, { spaces: 2 });
  return true;
});

// ── Profiles ──────────────────────────────────────────────────────────────────
function makeProfile(overrides = {}) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    id, name: 'New Profile', version: '1.21.1',
    loader: 'vanilla', loaderVersion: '',
    ram: 2048, width: 854, height: 480, fullscreen: false, javaPath: '',
    gameDir: path.join(INSTANCES_DIR, id),
    lastPlayed: null, playCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

ipcMain.handle('get-profiles', async () => {
  try {
    if (await fs.pathExists(PROFILES_FILE)) return await fs.readJson(PROFILES_FILE);
  } catch {}
  // First run: create default profile pointing to existing MC_DIR
  const def = makeProfile({ id: 'default', name: 'Default', gameDir: MC_DIR });
  await fs.writeJson(PROFILES_FILE, [def], { spaces: 2 });
  return [def];
});

ipcMain.handle('save-profiles', async (_, profiles) => {
  await fs.writeJson(PROFILES_FILE, profiles, { spaces: 2 });
  return true;
});

ipcMain.handle('create-profile', async (_, overrides) => {
  const profile = makeProfile(overrides);
  await fs.ensureDir(profile.gameDir);
  const profiles = await ipcMain.emit ? [] : [];
  let list = [];
  try { list = await fs.readJson(PROFILES_FILE); } catch {}
  list.push(profile);
  await fs.writeJson(PROFILES_FILE, list, { spaces: 2 });
  return profile;
});

ipcMain.handle('delete-profile', async (_, { id, deleteFiles }) => {
  let list = [];
  try { list = await fs.readJson(PROFILES_FILE); } catch {}
  const profile = list.find(p => p.id === id);
  if (profile && deleteFiles && profile.id !== 'default') {
    await fs.remove(profile.gameDir).catch(() => {});
  }
  await fs.writeJson(PROFILES_FILE, list.filter(p => p.id !== id), { spaces: 2 });
  return true;
});

// ── Dialog helpers ────────────────────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (_, opts) => {
  const { dialog } = require('electron');
  return dialog.showOpenDialog(mainWindow, opts);
});

ipcMain.handle('save-file-dialog', async (_, opts) => {
  const { dialog } = require('electron');
  return dialog.showSaveDialog(mainWindow, opts);
});

// ── System info ───────────────────────────────────────────────────────────────
ipcMain.handle('get-system-ram', async () => ({
  total: os.totalmem(),
  free: os.freemem(),
  suggested: Math.min(Math.max(Math.floor((os.totalmem() / 1024 / 1024) * 0.5 / 512) * 512, 1024), 8192),
}));

// ── Java ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-java-status', async () => {
  const platform = process.platform;
  const javaExe  = platform === 'win32' ? 'java.exe' : 'java';
  const javaPath = path.join(JAVA_DIR, 'jre', 'bin', javaExe);
  const exists   = await fs.pathExists(javaPath);
  let version = 0;
  if (exists) version = await getJavaVersion(javaPath);
  const sysVersion = await getJavaVersion('java');
  return { installed: exists, path: exists ? javaPath : null, platform, version, sysVersion };
});

ipcMain.handle('download-java', async (_, { version = 21 } = {}) => {
  const platform = process.platform;
  const arch     = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const osName   = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
  const apiUrl   = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?architecture=${arch}&image_type=jre&os=${osName}&vendor=eclipse`;

  return new Promise((resolve, reject) => {
    https.get(apiUrl, { headers: { 'User-Agent': 'nova-launcher/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', async () => {
        try {
          const assets = JSON.parse(data);
          if (!assets.length) return reject('No JRE assets found');
          const asset     = assets[0];
          const dlUrl     = asset.binary.package.link;
          const fileName  = asset.binary.package.name;
          const destFile  = path.join(JAVA_DIR, fileName);

          await downloadFileWithProgress(dlUrl, destFile, p =>
            mainWindow.webContents.send('download-progress', { type: 'java', ...p }));

          mainWindow.webContents.send('download-progress', { type: 'java', status: 'extracting' });
          await extractArchive(destFile, JAVA_DIR, platform);
          await fs.remove(destFile);

          const entries   = await fs.readdir(JAVA_DIR);
          const jreFolder = entries.find(e => e.startsWith('jdk') || e.startsWith('jre'));
          if (jreFolder) {
            const oldPath = path.join(JAVA_DIR, jreFolder);
            const newPath = path.join(JAVA_DIR, 'jre');
            if (await fs.pathExists(newPath)) await fs.remove(newPath);
            await fs.move(oldPath, newPath);
          }
          const javaExe  = platform === 'win32' ? 'java.exe' : 'java';
          const javaPath = path.join(JAVA_DIR, 'jre', 'bin', javaExe);
          if (platform !== 'win32') await fs.chmod(javaPath, '755');
          resolve({ success: true, path: javaPath });
        } catch (e) { reject(e.message || String(e)); }
      });
    }).on('error', e => reject(e.message));
  });
});

// ── Mods ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-mod-profiles', async (_, { gameDir }) => {
  const root = gameDir || MC_DIR;
  const versionsDir = path.join(root, 'versions');
  if (!await fs.pathExists(versionsDir)) return [];
  const entries = await fs.readdir(versionsDir);
  return entries.filter(e => e.includes('fabric') || e.includes('forge'));
});

ipcMain.handle('get-mods', async (_, { gameDir, profile }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  if (!await fs.pathExists(modsDir)) return [];
  const files = await fs.readdir(modsDir);
  const mods = [];
  for (const f of files) {
    if (!f.endsWith('.jar') && !f.endsWith('.jar.disabled')) continue;
    const stat = await fs.stat(path.join(modsDir, f));
    mods.push({ name: f.replace('.disabled', ''), file: f, size: stat.size, enabled: !f.endsWith('.disabled') });
  }
  return mods;
});

ipcMain.handle('add-mod', async (_, { gameDir, profile, srcPath }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  await fs.ensureDir(modsDir);
  await fs.copy(srcPath, path.join(modsDir, path.basename(srcPath)));
  return { success: true };
});

ipcMain.handle('delete-mod', async (_, { gameDir, profile, file }) => {
  await fs.remove(path.join(gameDir || MC_DIR, 'mods', file));
  return { success: true };
});

ipcMain.handle('toggle-mod', async (_, { gameDir, profile, file, enabled }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  const oldPath = path.join(modsDir, file);
  const newPath = enabled
    ? path.join(modsDir, file.replace('.disabled', ''))
    : path.join(modsDir, file.endsWith('.disabled') ? file : file + '.disabled');
  if (oldPath !== newPath) await fs.rename(oldPath, newPath);
  return { success: true };
});

ipcMain.handle('open-mods-folder', async (_, { gameDir, profile }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  await fs.ensureDir(modsDir);
  shell.openPath(modsDir);
  return true;
});

// ── Mod update checker (Modrinth hash API) ───────────────────────────────────
ipcMain.handle('check-mod-updates', async (_, { gameDir, profile }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  if (!await fs.pathExists(modsDir)) return { updates: [], checked: 0 };

  const files = (await fs.readdir(modsDir)).filter(f => f.endsWith('.jar'));
  if (!files.length) return { updates: [], checked: 0 };

  // Compute SHA512 of each jar
  const hashToFile = {};
  for (const f of files) {
    try {
      const h = await computeSHA512(path.join(modsDir, f));
      hashToFile[h] = f;
    } catch {}
  }

  const hashes = Object.keys(hashToFile);
  if (!hashes.length) return { updates: [], checked: 0 };

  try {
    // Query Modrinth version_files API
    const found = await fetchJsonPost('https://api.modrinth.com/v2/version_files', {
      hashes, algorithm: 'sha512',
    });

    const updates = [];
    for (const [hash, versionInfo] of Object.entries(found)) {
      const filename  = hashToFile[hash];
      const projectId = versionInfo.project_id;
      try {
        const latest = await fetchJson(`https://api.modrinth.com/v2/project/${projectId}/version?limit=1`);
        if (latest && latest.length > 0 && latest[0].id !== versionInfo.id) {
          const latestFile = latest[0].files.find(f => f.primary) || latest[0].files[0];
          updates.push({
            filename, projectId,
            currentVersion: versionInfo.version_number,
            latestVersion:  latest[0].version_number,
            latestFileUrl:  latestFile?.url,
            latestFilename: latestFile?.filename,
          });
        }
      } catch {}
    }

    return { updates, checked: hashes.length, found: Object.keys(found).length };
  } catch (e) {
    return { error: e.message, updates: [], checked: hashes.length };
  }
});

ipcMain.handle('update-mod', async (_, { gameDir, profile, oldFilename, newFileUrl, newFilename }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  const destPath = path.join(modsDir, newFilename);
  try {
    await downloadFileWithProgress(newFileUrl, destPath, () => {});
    await fs.remove(path.join(modsDir, oldFilename));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Loader install ─────────────────────────────────────────────────────────
ipcMain.handle('install-loader', async (_, { loaderType, mcVersion, loaderVersion, gameDir, javaPath }) => {
  const root = gameDir || MC_DIR;
  if (loaderType === 'fabric') return installFabric({ mcVersion, loaderVersion, root });
  if (loaderType === 'forge')  return installForge({ mcVersion, loaderVersion, root, javaPath });
  return { success: true, alreadyInstalled: true };
});

async function installFabric({ mcVersion, loaderVersion, root }) {
  const versionId   = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionDir  = path.join(root, 'versions', versionId);
  const versionJson = path.join(versionDir, `${versionId}.json`);
  if (await fs.pathExists(versionJson)) {
    mainWindow.webContents.send('launch-log', { level: 'info', msg: `Fabric already installed: ${versionId}` });
    return { success: true, alreadyInstalled: true };
  }
  mainWindow.webContents.send('launch-log', { level: 'info', msg: `Installing Fabric ${loaderVersion} for MC ${mcVersion}…` });
  const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  let profile;
  try { profile = await fetchJson(profileUrl); }
  catch (e) { return { success: false, error: `Failed to fetch Fabric profile: ${e}` }; }
  await fs.ensureDir(versionDir);
  await fs.writeJson(versionJson, profile, { spaces: 2 });
  const libraries = profile.libraries || [];
  const libDir = path.join(root, 'libraries');
  let done = 0;
  for (const lib of libraries) {
    try {
      const [group, artifact, version] = lib.name.split(':');
      const groupPath = group.replace(/\./g, '/');
      const jarName   = `${artifact}-${version}.jar`;
      const libPath   = path.join(libDir, groupPath, artifact, version, jarName);
      if (await fs.pathExists(libPath)) { done++; continue; }
      await fs.ensureDir(path.dirname(libPath));
      const url = lib.url
        ? `${lib.url.replace(/\/$/, '')}/${groupPath}/${artifact}/${version}/${jarName}`
        : `https://maven.fabricmc.net/${groupPath}/${artifact}/${version}/${jarName}`;
      for (const mirror of [url, `https://libraries.minecraft.net/${groupPath}/${artifact}/${version}/${jarName}`, `https://repo1.maven.org/maven2/${groupPath}/${artifact}/${version}/${jarName}`]) {
        try { await downloadFileWithProgress(mirror, libPath, () => {}); break; } catch {}
      }
    } catch {}
    done++;
    mainWindow.webContents.send('launch-progress', { type: 'fabric-libs', task: done, total: libraries.length });
  }
  return { success: true };
}

async function installForge({ mcVersion, loaderVersion, root, javaPath }) {
  const forgePart   = loaderVersion.includes('-') ? loaderVersion.split('-').slice(1).join('-') : loaderVersion;
  const fullVersion = `${mcVersion}-${forgePart}`;
  const versionId   = `${mcVersion}-forge-${forgePart}`;
  const versionJson = path.join(root, 'versions', versionId, `${versionId}.json`);
  if (await fs.pathExists(versionJson)) {
    mainWindow.webContents.send('launch-log', { level: 'info', msg: `Forge already installed: ${versionId}` });
    return { success: true, alreadyInstalled: true };
  }
  mainWindow.webContents.send('launch-log', { level: 'info', msg: `Downloading Forge installer for ${fullVersion}…` });
  const profilesPath = path.join(root, 'launcher_profiles.json');
  if (!await fs.pathExists(profilesPath)) {
    await fs.writeJson(profilesPath, { profiles: {}, selectedProfile: '(Default)', clientToken: 'nova-launcher', authenticationDatabase: {}, launcherVersion: { name: '2.0.0', format: 21, profilesFormat: 2 } }, { spaces: 2 });
  }
  const installerUrl  = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`;
  const installerPath = path.join(LAUNCHER_DIR, `forge-${fullVersion}-installer.jar`);
  try {
    await downloadFileWithProgress(installerUrl, installerPath, p => {
      mainWindow.webContents.send('launch-progress', { type: 'forge-dl', task: p.downloaded, total: p.total });
    });
  } catch (e) { return { success: false, error: `Failed to download Forge installer: ${e}` }; }
  const resolvedJava = javaPath || await findSystemJava();
  return new Promise((resolve) => {
    const proc = spawn(resolvedJava, ['-jar', installerPath, '--installClient', root], { cwd: root });
    let output = '';
    proc.stdout.on('data', d => { output += d; mainWindow.webContents.send('launch-log', { level: 'debug', msg: d.toString().trim() }); });
    proc.stderr.on('data', d => mainWindow.webContents.send('launch-log', { level: 'debug', msg: d.toString().trim() }));
    proc.on('close', async (code) => {
      await fs.remove(installerPath).catch(() => {});
      if (code === 0) resolve({ success: true });
      else resolve({ success: false, error: `Forge installer exited ${code}. ${output.slice(-200)}` });
    });
    proc.on('error', e => resolve({ success: false, error: e.message }));
  });
}

// ── Modrinth mods ─────────────────────────────────────────────────────────────
ipcMain.handle('search-modrinth', async (_, { query = '', mcVersion = '', loader = '', offset = 0 }) => {
  const facets = [['project_type:mod']];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  if (loader && loader !== 'vanilla' && loader !== 'optifine') facets.push([`categories:${loader}`]);
  const params = new URLSearchParams({ query, facets: JSON.stringify(facets), limit: '20', offset: String(offset), index: 'relevance' });
  try {
    const data = await fetchJson(`https://api.modrinth.com/v2/search?${params}`);
    return { hits: data.hits || [], total: data.total_hits || 0, offset };
  } catch (e) { return { error: e.message, hits: [], total: 0, offset }; }
});

ipcMain.handle('install-modrinth-mod', async (_, { projectId, mcVersion, loader, gameDir, profile }) => {
  try {
    const modsDir = path.join(gameDir || MC_DIR, 'mods');
    await fs.ensureDir(modsDir);
    const loaderParam = (loader && loader !== 'vanilla' && loader !== 'optifine') ? loader : '';
    let versionsUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`;
    const qp = [];
    if (mcVersion)   qp.push(`game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`);
    if (loaderParam) qp.push(`loaders=${encodeURIComponent(JSON.stringify([loaderParam]))}`);
    if (qp.length) versionsUrl += '?' + qp.join('&');
    const versions = await fetchJson(versionsUrl);
    if (!versions?.length) return { success: false, error: `No compatible version for MC ${mcVersion} / ${loader}` };
    const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
    if (!file) return { success: false, error: 'No downloadable file' };
    const destPath = path.join(modsDir, file.filename);
    if (await fs.pathExists(destPath)) return { success: true, alreadyInstalled: true, filename: file.filename };
    await downloadFileWithProgress(file.url, destPath, p =>
      mainWindow.webContents.send('modrinth-install-progress', { projectId, ...p, filename: file.filename }));
    return { success: true, filename: file.filename };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Modrinth modpacks ─────────────────────────────────────────────────────────
ipcMain.handle('search-modrinth-modpacks', async (_, { query = '', mcVersion = '', offset = 0 }) => {
  const facets = [['project_type:modpack']];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  const params = new URLSearchParams({ query, facets: JSON.stringify(facets), limit: '20', offset: String(offset), index: 'relevance' });
  try {
    const data = await fetchJson(`https://api.modrinth.com/v2/search?${params}`);
    return { hits: data.hits || [], total: data.total_hits || 0 };
  } catch (e) { return { error: e.message, hits: [], total: 0 }; }
});

ipcMain.handle('install-modrinth-modpack', async (_, { projectId, gameDir }) => {
  const root = gameDir || MC_DIR;
  try {
    // Get latest version of the modpack
    const versions = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`);
    if (!versions?.length) return { success: false, error: 'No versions found' };
    const version = versions[0];
    const file = version.files.find(f => f.primary) || version.files[0];
    if (!file) return { success: false, error: 'No .mrpack file found' };

    mainWindow.webContents.send('launch-log', { level: 'info', msg: `Downloading modpack: ${file.filename}…` });

    const tmpPath = path.join(LAUNCHER_DIR, file.filename);
    await downloadFileWithProgress(file.url, tmpPath, p =>
      mainWindow.webContents.send('launch-progress', { type: 'modpack-dl', task: p.downloaded, total: p.total }));

    // Extract .mrpack (it's a zip)
    const extractDir = path.join(LAUNCHER_DIR, 'mrpack-tmp-' + Date.now());
    await extractArchive(tmpPath, extractDir, process.platform);
    await fs.remove(tmpPath);

    // Parse modrinth.index.json
    const indexPath = path.join(extractDir, 'modrinth.index.json');
    if (!await fs.pathExists(indexPath)) {
      await fs.remove(extractDir);
      return { success: false, error: 'Invalid .mrpack: missing modrinth.index.json' };
    }
    const index = await fs.readJson(indexPath);
    const totalFiles = (index.files || []).length;
    let downloaded = 0;

    mainWindow.webContents.send('launch-log', { level: 'info', msg: `Installing ${totalFiles} modpack files…` });

    for (const f of (index.files || [])) {
      try {
        const destPath = path.join(root, f.path.replace(/^\.\//, ''));
        if (await fs.pathExists(destPath)) { downloaded++; continue; }
        await fs.ensureDir(path.dirname(destPath));
        for (const dlUrl of (f.downloads || [])) {
          try { await downloadFileWithProgress(dlUrl, destPath, () => {}); break; } catch {}
        }
      } catch {}
      downloaded++;
      mainWindow.webContents.send('launch-progress', { type: 'modpack-files', task: downloaded, total: totalFiles });
    }

    // Copy overrides
    const overridesDir = path.join(extractDir, 'overrides');
    if (await fs.pathExists(overridesDir)) await fs.copy(overridesDir, root, { overwrite: true });
    await fs.remove(extractDir);

    const deps = index.dependencies || {};
    return { success: true, name: index.name, mcVersion: deps.minecraft, fabricLoader: deps['fabric-loader'], forgeVersion: deps.forge };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Modpack export / import ───────────────────────────────────────────────────
ipcMain.handle('export-modpack', async (_, { gameDir, name, outputPath }) => {
  const root = gameDir || MC_DIR;
  try {
    let archiver;
    try { archiver = require('archiver'); } catch { return { success: false, error: 'archiver package not installed. Run: npm install archiver' }; }

    const destPath = outputPath || path.join(LAUNCHER_DIR, `${(name || 'modpack').replace(/\s+/g, '-')}.zip`);
    const output   = require('fs').createWriteStream(destPath);
    const archive  = archiver('zip', { zlib: { level: 6 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve({ success: true, path: destPath, size: archive.pointer() }));
      archive.on('error', e => resolve({ success: false, error: e.message }));
      archive.pipe(output);

      const modsDir   = path.join(root, 'mods');
      const configDir = path.join(root, 'config');
      if (require('fs').existsSync(modsDir))   archive.directory(modsDir,   'mods');
      if (require('fs').existsSync(configDir)) archive.directory(configDir, 'config');

      archive.append(JSON.stringify({ name: name || 'Nova Modpack', exportedAt: new Date().toISOString(), format: 'nova-modpack-v1' }, null, 2), { name: 'nova-modpack.json' });
      archive.finalize();
    });
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('import-modpack', async (_, { zipPath, gameDir }) => {
  const root = gameDir || MC_DIR;
  try {
    const tmpDir = path.join(LAUNCHER_DIR, 'import-tmp-' + Date.now());
    await extractArchive(zipPath, tmpDir, process.platform);

    // Detect format
    const isMrpack = await fs.pathExists(path.join(tmpDir, 'modrinth.index.json'));
    const isNova   = await fs.pathExists(path.join(tmpDir, 'nova-modpack.json'));

    if (isMrpack) {
      await fs.remove(tmpDir);
      // Delegate to install-modrinth-modpack via manual zip
      return { success: false, error: 'Use the Modrinth modpack installer for .mrpack files' };
    }

    if (isNova) {
      const modsDir   = path.join(tmpDir, 'mods');
      const configDir = path.join(tmpDir, 'config');
      if (await fs.pathExists(modsDir))   await fs.copy(modsDir,   path.join(root, 'mods'),   { overwrite: true });
      if (await fs.pathExists(configDir)) await fs.copy(configDir, path.join(root, 'config'), { overwrite: true });
    } else {
      // Try copying everything
      await fs.copy(tmpDir, root, { overwrite: true });
    }

    await fs.remove(tmpDir);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Screenshots ───────────────────────────────────────────────────────────────
ipcMain.handle('get-screenshots', async (_, { gameDir }) => {
  const screenshotsDir = path.join(gameDir || MC_DIR, 'screenshots');
  if (!await fs.pathExists(screenshotsDir)) return [];
  const files = await fs.readdir(screenshotsDir);
  const imgs = [];
  for (const f of files) {
    if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
    try {
      const stat = await fs.stat(path.join(screenshotsDir, f));
      imgs.push({ name: f, fullPath: path.join(screenshotsDir, f).replace(/\\/g, '/'), size: stat.size, mtime: stat.mtimeMs });
    } catch {}
  }
  return imgs.sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('open-screenshot', async (_, { filePath }) => {
  shell.openPath(filePath);
  return true;
});

ipcMain.handle('open-screenshots-folder', async (_, { gameDir }) => {
  const dir = path.join(gameDir || MC_DIR, 'screenshots');
  await fs.ensureDir(dir);
  shell.openPath(dir);
  return true;
});

// ── Update checker ────────────────────────────────────────────────────────────
ipcMain.handle('check-update', async (_, { repo = 'Rosilon/Nova-launcher' } = {}) => {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const latestVersion = (data.tag_name || '').replace(/^v/, '');
    // Find .exe asset
    const assets = data.assets || [];
    const exeAsset = assets.find(a => a.name.endsWith('.exe'));
    return {
      current: packageVersion,
      latest: latestVersion,
      hasUpdate: isNewerVersion(packageVersion, latestVersion),
      releaseUrl: data.html_url || '',
      downloadUrl: exeAsset?.browser_download_url || '',
      fileName: exeAsset?.name || '',
      fileSize: exeAsset?.size || 0,
      releaseNotes: (data.body || '').slice(0, 800),
    };
  } catch (e) { return { error: e.message, current: packageVersion }; }
});

ipcMain.handle('download-update', async (_, { downloadUrl, fileName }) => {
  try {
    const dest = path.join(os.tmpdir(), fileName);
    // Stream download with progress
    await new Promise((resolve, reject) => {
      const follow = (url, redirects = 0) => {
        if (redirects > 10) return reject(new Error('Too many redirects'));
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'Nova-Launcher' } }, res => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            return follow(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          const out = require('fs').createWriteStream(dest);
          res.on('data', chunk => {
            received += chunk.length;
            if (total > 0) {
              mainWindow.webContents.send('update-download-progress', {
                percent: Math.round((received / total) * 100),
                received,
                total,
              });
            }
            out.write(chunk);
          });
          res.on('end', () => { out.end(); resolve(); });
          res.on('error', reject);
          out.on('error', reject);
        }).on('error', reject);
      };
      follow(downloadUrl);
    });
    return { success: true, path: dest };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('install-update', async (_, { filePath }) => {
  try {
    // Run NSIS installer silently (/S flag) — installs without wizard, then relaunches
    const { spawn } = require('child_process');
    const child = spawn(filePath, ['/S'], {
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    setTimeout(() => app.quit(), 1200);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Crash logs ────────────────────────────────────────────────────────────────
ipcMain.handle('get-crash-logs', async (_, { gameDir }) => {
  const crashDir = path.join(gameDir || MC_DIR, 'crash-reports');
  if (!await fs.pathExists(crashDir)) return [];
  const files = await fs.readdir(crashDir);
  const logs = [];
  for (const f of files) {
    if (!f.endsWith('.txt')) continue;
    try {
      const stat = await fs.stat(path.join(crashDir, f));
      logs.push({ name: f, fullPath: path.join(crashDir, f), size: stat.size, mtime: stat.mtimeMs });
    } catch {}
  }
  return logs.sort((a, b) => b.mtime - a.mtime).slice(0, 20);
});

ipcMain.handle('read-crash-log', async (_, { logPath }) => {
  try {
    const content = await fs.readFile(logPath, 'utf8');
    return { content, analysis: analyzeCrashLog(content) };
  } catch (e) { return { error: e.message }; }
});

// ── Servers ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-servers', async () => {
  try {
    if (await fs.pathExists(SERVERS_FILE)) return await fs.readJson(SERVERS_FILE);
  } catch {}
  return [];
});

ipcMain.handle('save-servers', async (_, servers) => {
  await fs.writeJson(SERVERS_FILE, servers, { spaces: 2 });
  return true;
});

ipcMain.handle('ping-server', async (_, { host, port = 25565 }) => {
  return pingMinecraftServer(host, parseInt(port, 10) || 25565);
});

// ── Resource Packs ────────────────────────────────────────────────────────────
ipcMain.handle('get-resourcepacks', async (_, { gameDir }) => {
  const rpDir = path.join(gameDir || MC_DIR, 'resourcepacks');
  await fs.ensureDir(rpDir);
  const entries = await fs.readdir(rpDir);
  const enabled = await getEnabledResourcePacks(gameDir || MC_DIR);
  const packs = [];
  for (const f of entries) {
    if (f === 'server-resource-packs') continue;
    try {
      const stat = await fs.stat(path.join(rpDir, f));
      const isZip = f.endsWith('.zip');
      const isDir = stat.isDirectory();
      if (!isZip && !isDir) continue;
      packs.push({
        name: f,
        size: isZip ? stat.size : 0,
        isDir,
        enabled: enabled.includes(`file/${f}`),
        mtime: stat.mtimeMs,
      });
    } catch {}
  }
  return packs.sort((a, b) => b.mtime - a.mtime);
});

async function getEnabledResourcePacks(gameDir) {
  const optPath = path.join(gameDir, 'options.txt');
  try {
    const content = await fs.readFile(optPath, 'utf8');
    const line = content.split('\n').find(l => l.startsWith('resourcePacks:'));
    if (!line) return [];
    const match = line.match(/resourcePacks:\[(.*)\]/);
    if (!match) return [];
    return match[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  } catch { return []; }
}

async function setEnabledResourcePacks(gameDir, packs) {
  const optPath = path.join(gameDir, 'options.txt');
  try {
    let content = '';
    if (await fs.pathExists(optPath)) content = await fs.readFile(optPath, 'utf8');
    const line = `resourcePacks:[${packs.map(p => `"${p}"`).join(',')}]`;
    if (content.includes('resourcePacks:')) {
      content = content.replace(/resourcePacks:\[.*\]/, line);
    } else {
      content += '\n' + line;
    }
    await fs.writeFile(optPath, content, 'utf8');
  } catch {}
}

ipcMain.handle('toggle-resourcepack', async (_, { gameDir, name, enabled }) => {
  const root = gameDir || MC_DIR;
  const current = await getEnabledResourcePacks(root);
  const key = `file/${name}`;
  let updated;
  if (enabled) updated = current.includes(key) ? current : [...current, key];
  else updated = current.filter(p => p !== key);
  await setEnabledResourcePacks(root, updated);
  return { success: true };
});

ipcMain.handle('add-resourcepack', async (_, { gameDir, srcPath }) => {
  const rpDir = path.join(gameDir || MC_DIR, 'resourcepacks');
  await fs.ensureDir(rpDir);
  await fs.copy(srcPath, path.join(rpDir, path.basename(srcPath)));
  return { success: true };
});

ipcMain.handle('delete-resourcepack', async (_, { gameDir, name }) => {
  await fs.remove(path.join(gameDir || MC_DIR, 'resourcepacks', name));
  return { success: true };
});

ipcMain.handle('open-resourcepacks-folder', async (_, { gameDir }) => {
  const dir = path.join(gameDir || MC_DIR, 'resourcepacks');
  await fs.ensureDir(dir);
  shell.openPath(dir);
  return true;
});

// ── Shader Packs ──────────────────────────────────────────────────────────────
ipcMain.handle('get-shaderpacks', async (_, { gameDir }) => {
  const spDir = path.join(gameDir || MC_DIR, 'shaderpacks');
  await fs.ensureDir(spDir);
  const entries = await fs.readdir(spDir);
  const packs = [];
  for (const f of entries) {
    try {
      const stat = await fs.stat(path.join(spDir, f));
      const isZip = f.endsWith('.zip');
      const isDir = stat.isDirectory();
      if (!isZip && !isDir) continue;
      packs.push({ name: f, size: isZip ? stat.size : 0, isDir, mtime: stat.mtimeMs });
    } catch {}
  }
  return packs.sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('add-shaderpack', async (_, { gameDir, srcPath }) => {
  const spDir = path.join(gameDir || MC_DIR, 'shaderpacks');
  await fs.ensureDir(spDir);
  await fs.copy(srcPath, path.join(spDir, path.basename(srcPath)));
  return { success: true };
});

ipcMain.handle('delete-shaderpack', async (_, { gameDir, name }) => {
  await fs.remove(path.join(gameDir || MC_DIR, 'shaderpacks', name));
  return { success: true };
});

ipcMain.handle('open-shaderpacks-folder', async (_, { gameDir }) => {
  const dir = path.join(gameDir || MC_DIR, 'shaderpacks');
  await fs.ensureDir(dir);
  shell.openPath(dir);
  return true;
});

// ── Modrinth Resource Pack Browser ───────────────────────────────────────────
ipcMain.handle('search-modrinth-resourcepacks', async (_, { query = '', mcVersion = '', offset = 0 }) => {
  try {
    const facets = [['project_type:resourcepack']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    const params = new URLSearchParams({
      query,
      facets: JSON.stringify(facets),
      limit: '20',
      offset: String(offset),
      index: 'relevance',
    });
    const url = `https://api.modrinth.com/v2/search?${params}`;
    const data = await fetchJson(url);
    return { hits: data.hits || [], total: data.total_hits || 0 };
  } catch (e) { return { hits: [], total: 0, error: e.message }; }
});

ipcMain.handle('install-modrinth-resourcepack', async (_, { projectId, mcVersion, gameDir }) => {
  try {
    const rpDir = path.join(gameDir || MC_DIR, 'resourcepacks');
    await fs.ensureDir(rpDir);
    let versionsUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`;
    if (mcVersion) versionsUrl += `?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versions = await fetchJson(versionsUrl);
    if (!versions?.length) return { success: false, error: `No version found for MC ${mcVersion}` };
    const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
    if (!file) return { success: false, error: 'No downloadable file' };
    const destPath = path.join(rpDir, file.filename);
    if (await fs.pathExists(destPath)) return { success: true, alreadyInstalled: true, filename: file.filename };
    await downloadFileWithProgress(file.url, destPath, p =>
      mainWindow.webContents.send('modrinth-install-progress', { projectId, ...p, filename: file.filename }));
    return { success: true, filename: file.filename };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Modrinth Shader Pack Browser ─────────────────────────────────────────────
ipcMain.handle('search-modrinth-shaderpacks', async (_, { query = '', mcVersion = '', offset = 0 }) => {
  try {
    const facets = [['project_type:shader']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    const params = new URLSearchParams({
      query,
      facets: JSON.stringify(facets),
      limit: '20',
      offset: String(offset),
      index: 'relevance',
    });
    const url = `https://api.modrinth.com/v2/search?${params}`;
    const data = await fetchJson(url);
    return { hits: data.hits || [], total: data.total_hits || 0 };
  } catch (e) { return { hits: [], total: 0, error: e.message }; }
});

ipcMain.handle('install-modrinth-shaderpack', async (_, { projectId, mcVersion, gameDir }) => {
  try {
    const spDir = path.join(gameDir || MC_DIR, 'shaderpacks');
    await fs.ensureDir(spDir);
    let versionsUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`;
    if (mcVersion) versionsUrl += `?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versions = await fetchJson(versionsUrl);
    if (!versions?.length) return { success: false, error: `No version found for MC ${mcVersion}` };
    const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
    if (!file) return { success: false, error: 'No downloadable file' };
    const destPath = path.join(spDir, file.filename);
    if (await fs.pathExists(destPath)) return { success: true, alreadyInstalled: true, filename: file.filename };
    await downloadFileWithProgress(file.url, destPath, p =>
      mainWindow.webContents.send('modrinth-install-progress', { projectId, ...p, filename: file.filename }));
    return { success: true, filename: file.filename };
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Worlds ────────────────────────────────────────────────────────────────────
ipcMain.handle('get-worlds', async (_, { gameDir }) => {
  const savesDir = path.join(gameDir || MC_DIR, 'saves');
  if (!await fs.pathExists(savesDir)) return [];
  const entries = await fs.readdir(savesDir);
  const worlds = [];
  for (const folder of entries) {
    const worldPath = path.join(savesDir, folder);
    try {
      const stat = await fs.stat(worldPath);
      if (!stat.isDirectory()) continue;
      const levelDatPath = path.join(worldPath, 'level.dat');
      let info = { levelName: folder, gameType: null, seed: null, lastPlayed: null };
      if (await fs.pathExists(levelDatPath)) {
        const parsed = await parseLevelDat(levelDatPath);
        if (parsed) info = { ...info, ...parsed };
      }
      worlds.push({
        folder,
        path: worldPath,
        ...info,
        mtime: stat.mtimeMs,
      });
    } catch {}
  }
  return worlds.sort((a, b) => (b.lastPlayed || b.mtime) - (a.lastPlayed || a.mtime));
});

ipcMain.handle('open-world-folder', async (_, { worldPath }) => {
  shell.openPath(worldPath);
  return true;
});

ipcMain.handle('delete-world', async (_, { worldPath }) => {
  await fs.remove(worldPath);
  return { success: true };
});

ipcMain.handle('backup-world', async (_, { worldPath, worldName }) => {
  try {
    let archiver;
    try { archiver = require('archiver'); } catch { return { success: false, error: 'archiver not installed. Run: npm install archiver' }; }
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(LAUNCHER_DIR, 'world-backups', `${worldName}-${ts}.zip`);
    await fs.ensureDir(path.dirname(dest));
    const output  = require('fs').createWriteStream(dest);
    const archive = archiver('zip', { zlib: { level: 6 } });
    return new Promise((resolve) => {
      output.on('close', () => resolve({ success: true, path: dest }));
      archive.on('error', e => resolve({ success: false, error: e.message }));
      archive.pipe(output);
      archive.directory(worldPath, worldName);
      archive.finalize();
    });
  } catch (e) { return { success: false, error: e.message }; }
});

// ── Mod conflict detector ─────────────────────────────────────────────────────
ipcMain.handle('check-mod-conflicts', async (_, { gameDir, profile }) => {
  const modsDir = path.join(gameDir || MC_DIR, 'mods');
  if (!await fs.pathExists(modsDir)) return { conflicts: [], checked: 0 };

  const files = (await fs.readdir(modsDir)).filter(f => f.endsWith('.jar'));
  if (!files.length) return { conflicts: [], checked: 0 };

  const hashToFile = {};
  for (const f of files) {
    try { hashToFile[await computeSHA512(path.join(modsDir, f))] = f; } catch {}
  }
  const hashes = Object.keys(hashToFile);
  if (!hashes.length) return { conflicts: [], checked: 0 };

  try {
    const found = await fetchJsonPost('https://api.modrinth.com/v2/version_files', { hashes, algorithm: 'sha512' });
    // Map file → project_id
    const fileToProject = {};
    const projectIdSet  = new Set();
    Object.entries(found).forEach(([hash, v]) => {
      fileToProject[hashToFile[hash]] = v.project_id;
      projectIdSet.add(v.project_id);
    });

    const conflicts = [];
    const seen = new Set();

    for (const [hash, versionInfo] of Object.entries(found)) {
      const filename = hashToFile[hash];
      for (const dep of (versionInfo.dependencies || [])) {
        if (dep.dependency_type === 'incompatible' && dep.project_id && projectIdSet.has(dep.project_id)) {
          const conflictFile = Object.entries(fileToProject).find(([, pid]) => pid === dep.project_id)?.[0] || dep.project_id;
          const key = [filename, conflictFile].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push({ mod1: filename, mod2: conflictFile, reason: 'Declared incompatible on Modrinth' });
          }
        }
      }
    }
    return { conflicts, checked: files.length, identified: Object.keys(found).length };
  } catch (e) { return { error: e.message, conflicts: [], checked: files.length }; }
});

// ── Launch ────────────────────────────────────────────────────────────────────
ipcMain.handle('launch-minecraft', async (_, { username, version, ram, javaPath, gameDir, width, height, fullscreen, loaderType, loaderVersion, profileId }) => {
  try {
    let Client, Authenticator;
    try { ({ Client, Authenticator } = require('minecraft-launcher-core')); }
    catch { return { success: false, error: 'minecraft-launcher-core not installed.' }; }

    const launcher     = new Client();
    const resolvedJava = await resolveJavaForVersion(version, javaPath);
    mainWindow.webContents.send('launch-log', { level: 'info', msg: `Using Java: ${resolvedJava}` });

    const javaVer = await getJavaVersion(resolvedJava);
    const needed  = requiredJavaVersion(version);
    if (javaVer > 0) mainWindow.webContents.send('launch-log', { level: 'info', msg: `Java ${javaVer} ✓ (need ${needed}+)` });

    if ((loaderType === 'fabric' || loaderType === 'forge') && loaderVersion) {
      const ir = await (loaderType === 'fabric'
        ? installFabric({ mcVersion: version, loaderVersion, root: gameDir || MC_DIR })
        : installForge({ mcVersion: version, loaderVersion, root: gameDir || MC_DIR, javaPath: resolvedJava }));
      if (!ir.success) return { success: false, error: `${loaderType} install failed: ${ir.error}` };
    }

    let versionObj;
    if (loaderType === 'fabric' && loaderVersion) versionObj = { number: version, type: 'fabric', custom: `fabric-loader-${loaderVersion}-${version}` };
    else if (loaderType === 'forge' && loaderVersion) versionObj = { number: version, type: 'forge', custom: `${version}-forge-${loaderVersion}` };
    else versionObj = { number: version, type: 'release' };

    const opts = {
      clientPackage: null, authorization: Authenticator.getAuth(username),
      root: gameDir || MC_DIR, version: versionObj,
      memory: { max: `${ram}M`, min: `${Math.min(512, ram)}M` },
      javaPath: resolvedJava,
      window: { width: fullscreen ? undefined : width, height: fullscreen ? undefined : height, fullscreen },
      overrides: { detached: true },
    };

    launcher.on('debug',    e => mainWindow.webContents.send('launch-log',      { level: 'debug', msg: e }));
    launcher.on('data',     e => mainWindow.webContents.send('launch-log',      { level: 'info',  msg: e }));
    launcher.on('progress', e => mainWindow.webContents.send('launch-progress', e));

    // Store process ref for cancellation
    global._mcKillPending = false;
    launcher.on('child-process', (proc) => {
      global._mcProcess = proc;
      if (global._mcKillPending) {
        global._mcKillPending = false;
        try { proc.kill('SIGTERM'); } catch {}
        global._mcProcess = null;
      }
    });

    launcher.on('close', async (code) => {
      global._mcProcess = null;
      global._mcKillPending = false;
      mainWindow.webContents.send('game-closed', { code });
      // Update profile stats
      if (profileId) {
        try {
          let profiles = await fs.readJson(PROFILES_FILE);
          const p = profiles.find(p => p.id === profileId);
          if (p) {
            p.lastPlayed = new Date().toISOString();
            p.playCount  = (p.playCount || 0) + 1;
            await fs.writeJson(PROFILES_FILE, profiles, { spaces: 2 });
          }
        } catch {}
      }
      // If crash, send crash event
      if (code !== 0) {
        try {
          const crashDir  = path.join(gameDir || MC_DIR, 'crash-reports');
          const files     = await fs.readdir(crashDir).catch(() => []);
          const latest    = files.filter(f => f.endsWith('.txt')).sort().pop();
          if (latest) {
            const content   = await fs.readFile(path.join(crashDir, latest), 'utf8');
            const analysis  = analyzeCrashLog(content);
            mainWindow.webContents.send('game-crashed', { code, analysis, logName: latest });
          }
        } catch {}
      }
    });

    await launcher.launch(opts);
    return { success: true };
  } catch (e) { return { success: false, error: e.message || String(e) }; }
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// ── NBT level.dat parser ──────────────────────────────────────────────────────
async function parseLevelDat(filePath) {
  try {
    const zlib = require('zlib');
    const raw  = await fs.readFile(filePath);
    const buf  = zlib.gunzipSync(raw);

    const levelName  = nbtFindString(buf, 'LevelName');
    const gameType   = nbtFindInt(buf, 'GameType');
    const seed       = nbtFindLong(buf, 'RandomSeed') || nbtFindLong(buf, 'WorldGenSettings');
    const lastPlayed = nbtFindLong(buf, 'LastPlayed');

    const gameModes = ['Survival', 'Creative', 'Adventure', 'Spectator'];

    return {
      levelName:  levelName  || null,
      gameType:   gameType   != null ? (gameModes[gameType] || `Mode ${gameType}`) : null,
      seed:       seed       || null,
      lastPlayed: lastPlayed ? Number(BigInt(lastPlayed)) : null,
    };
  } catch { return null; }
}

function nbtFindString(buf, key) {
  const kb = Buffer.from(key, 'utf8');
  for (let i = 0; i < buf.length - kb.length - 5; i++) {
    if (buf[i] === 8) {
      const nl = buf.readUInt16BE(i + 1);
      if (nl === kb.length && buf.slice(i + 3, i + 3 + nl).equals(kb)) {
        const vo = i + 3 + nl;
        if (vo + 2 > buf.length) continue;
        const vl = buf.readUInt16BE(vo);
        if (vo + 2 + vl > buf.length) continue;
        return buf.slice(vo + 2, vo + 2 + vl).toString('utf8');
      }
    }
  }
  return null;
}

function nbtFindInt(buf, key) {
  const kb = Buffer.from(key, 'utf8');
  for (let i = 0; i < buf.length - kb.length - 7; i++) {
    if (buf[i] === 3) {
      const nl = buf.readUInt16BE(i + 1);
      if (nl === kb.length && buf.slice(i + 3, i + 3 + nl).equals(kb)) {
        return buf.readInt32BE(i + 3 + nl);
      }
    }
  }
  return null;
}

function nbtFindLong(buf, key) {
  const kb = Buffer.from(key, 'utf8');
  for (let i = 0; i < buf.length - kb.length - 11; i++) {
    if (buf[i] === 4) {
      const nl = buf.readUInt16BE(i + 1);
      if (nl === kb.length && buf.slice(i + 3, i + 3 + nl).equals(kb)) {
        const hi = BigInt(buf.readInt32BE(i + 3 + nl));
        const lo = BigInt(buf.readUInt32BE(i + 3 + nl + 4));
        return ((hi << 32n) | lo).toString();
      }
    }
  }
  return null;
}


function requiredJavaVersion(v) {
  const m = v.match(/^1\.(\d+)/);
  if (!m) return 17;
  const n = parseInt(m[1], 10);
  if (n >= 21) return 21;
  if (n >= 17) return 17;
  return 8;
}

function getJavaVersion(javaPath) {
  return new Promise((resolve) => {
    exec(`"${javaPath}" -version`, (err, out, err2) => {
      if (err) return resolve(0);
      const m = (out + err2).match(/"(\d+)(?:\.(\d+))?/);
      if (!m) return resolve(0);
      const major = parseInt(m[1], 10);
      resolve(major === 1 ? parseInt(m[2] || '8', 10) : major);
    });
  });
}

async function findSystemJava() {
  const exe  = process.platform === 'win32' ? 'java.exe' : 'java';
  const bund = path.join(JAVA_DIR, 'jre', 'bin', exe);
  if (await fs.pathExists(bund)) return bund;
  return 'java';
}

async function resolveJavaForVersion(mcVersion, customJavaPath) {
  if (customJavaPath) return customJavaPath;
  const needed = requiredJavaVersion(mcVersion);
  const exe    = process.platform === 'win32' ? 'java.exe' : 'java';
  const bund   = path.join(JAVA_DIR, 'jre', 'bin', exe);
  if (await fs.pathExists(bund)) {
    const ver = await getJavaVersion(bund);
    if (ver >= needed) return bund;
  }
  const sysVer = await getJavaVersion('java');
  if (sysVer >= needed) return 'java';
  if (await fs.pathExists(bund)) return bund;
  return 'java';
}

function downloadFileWithProgress(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return downloadFileWithProgress(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const file = require('fs').createWriteStream(dest);
      res.on('data', chunk => {
        downloaded += chunk.length;
        file.write(chunk);
        if (total > 0) onProgress({ status: 'downloading', percent: Math.round((downloaded / total) * 100), downloaded, total });
      });
      res.on('end',   () => { file.end(); resolve(); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function extractArchive(filePath, destDir, platform) {
  if (platform === 'win32' || filePath.endsWith('.zip') || filePath.endsWith('.mrpack') || filePath.endsWith('.jar')) {
    const extractZip = require('extract-zip');
    await extractZip(filePath, { dir: destDir });
  } else {
    await new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', filePath, '-C', destDir]);
      tar.on('close', code => code === 0 ? resolve() : reject(`tar exited ${code}`));
      tar.on('error', reject);
    });
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'nova-launcher/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(`JSON error: ${e.message}`); } });
    }).on('error', reject);
  });
}

function fetchJsonPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'nova-launcher/1.0' },
    };
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function computeSHA512(filePath) {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha512');
    const stream = require('fs').createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end',  () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function isNewerVersion(current, latest) {
  if (!latest) return false;
  const c = (current || '0.0.0').split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function analyzeCrashLog(content) {
  const lines = content.split('\n');
  const get = (keyword) => {
    const l = lines.find(x => x.includes(keyword));
    return l ? l.split(':').slice(1).join(':').trim() : '';
  };

  const result = {
    description:  '',
    errorType:    '',
    errorMessage: '',
    culpritMod:   '',
    javaVersion:  get('Java Version'),
    mcVersion:    get('Minecraft Version'),
    osInfo:       get('Operating System'),
    stackTrace:   [],
    summary:      '',
  };

  const descLine = lines.find(l => l.startsWith('Description:'));
  if (descLine) result.description = descLine.replace('Description:', '').trim();

  const exMatch = content.match(/^([a-zA-Z$.]+(?:Exception|Error)[a-zA-Z$.]*):?\s*(.*?)$/m);
  if (exMatch) { result.errorType = exMatch[1].split('.').pop(); result.errorMessage = exMatch[2]; }

  const modLine = lines.find(l => l.includes('Suspected Mods:') || l.includes('Mod that crashed:'));
  if (modLine) result.culpritMod = modLine.split(':').slice(1).join(':').trim();

  const stackStart = content.indexOf('\tat ');
  if (stackStart !== -1) {
    result.stackTrace = content.slice(stackStart).split('\n')
      .filter(l => l.trim().startsWith('at '))
      .slice(0, 8)
      .map(l => l.trim());
    if (!result.culpritMod) {
      const suspect = result.stackTrace.find(l =>
        !l.includes('java.') && !l.includes('sun.') && !l.includes('net.minecraft.') && !l.includes('com.mojang.'));
      if (suspect) result.culpritMod = suspect.replace('at ', '').split('(')[0];
    }
  }

  // Human-readable summary
  if (result.errorType === 'OutOfMemoryError')
    result.summary = 'The game ran out of memory. Try increasing RAM allocation in Settings.';
  else if (result.errorType === 'ClassNotFoundException' || result.errorType === 'NoClassDefFoundError')
    result.summary = 'A required class was not found — likely a missing or incompatible mod/dependency.';
  else if (result.errorType === 'NullPointerException')
    result.summary = `Null pointer error${result.culpritMod ? ' — possibly caused by: ' + result.culpritMod : ''}.`;
  else if (result.errorType === 'UnsupportedClassVersionError')
    result.summary = `Wrong Java version. Minecraft ${result.mcVersion} needs Java ${result.javaVersion || '17+'}.`;
  else
    result.summary = result.description || result.errorType || 'Unknown crash. Check the full log below.';

  return result;
}

// ── Minecraft Server Ping (SLP) ───────────────────────────────────────────────
function encodeVarInt(val) {
  const bytes = [];
  do {
    let b = val & 0x7F;
    val >>>= 7;
    if (val !== 0) b |= 0x80;
    bytes.push(b);
  } while (val !== 0);
  return Buffer.from(bytes);
}

function decodeVarInt(buf, offset) {
  let result = 0, shift = 0, read = 0;
  do {
    if (offset + read >= buf.length) throw new Error('Buffer too short');
    const b = buf[offset + read++];
    result |= (b & 0x7F) << shift;
    shift  += 7;
    if (!(b & 0x80)) break;
  } while (shift < 35);
  return [result, read];
}

function encodeString(str) {
  const b = Buffer.from(str, 'utf8');
  return Buffer.concat([encodeVarInt(b.length), b]);
}

function pingMinecraftServer(host, port = 25565) {
  return new Promise((resolve) => {
    const socket   = new net.Socket();
    let responded  = false;
    let incoming   = Buffer.alloc(0);

    const done = (result) => {
      if (!responded) { responded = true; socket.destroy(); resolve(result); }
    };

    socket.setTimeout(5000);
    socket.on('timeout', () => done({ online: false, error: 'Timeout', host, port }));
    socket.on('error',   e  => done({ online: false, error: e.message, host, port }));

    socket.connect(port, host, () => {
      // Handshake packet
      const handshakeData = Buffer.concat([
        Buffer.from([0x00]),   // Packet ID
        encodeVarInt(0),       // Protocol version (0 = detect)
        encodeString(host),    // Server address
        Buffer.from([port >> 8, port & 0xFF]), // Port (big-endian ushort)
        Buffer.from([0x01]),   // Next state: status
      ]);
      socket.write(Buffer.concat([encodeVarInt(handshakeData.length), handshakeData]));
      // Status request
      socket.write(Buffer.from([0x01, 0x00]));
    });

    socket.on('data', (chunk) => {
      incoming = Buffer.concat([incoming, chunk]);
      try {
        let offset = 0;
        const [pktLen, lenBytes] = decodeVarInt(incoming, offset);
        offset += lenBytes;
        if (incoming.length < offset + pktLen) return;
        const [pktId, idBytes] = decodeVarInt(incoming, offset);
        offset += idBytes;
        if (pktId !== 0x00) return;
        const [strLen, slBytes] = decodeVarInt(incoming, offset);
        offset += slBytes;
        const jsonStr = incoming.slice(offset, offset + strLen).toString('utf8');
        const status  = JSON.parse(jsonStr);
        const desc    = status.description;
        const motd    = typeof desc === 'string' ? desc : (desc?.text || desc?.extra?.map(e => e.text || '').join('') || '');
        done({
          online:  true,
          host,    port,
          motd:    motd.replace(/§./g, '').trim(),
          players: status.players || { online: 0, max: 0 },
          version: status.version?.name || '?',
          latency: Date.now(),
        });
      } catch {}
    });
  });
}