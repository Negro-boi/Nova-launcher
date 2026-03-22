/* global launcher */
'use strict';

// ── Helpers ────────────────────────────────────────────────────────────────
function requiredJavaForMC(v) {
  const m = (v || '').match(/^1\.(\d+)/);
  if (!m) return 17;
  const n = parseInt(m[1], 10);
  return n >= 21 ? 21 : n >= 17 ? 17 : 8;
}
function formatRam(mb) {
  const n = parseInt(mb, 10);
  return n >= 1024 ? `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} GB` : `${n} MB`;
}
function formatBytes(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1024).toFixed(0) + ' KB';
}
function formatDownloads(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return String(n);
}
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeAgo(iso) {
  if (!iso) return 'Never';
  const d = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (d < 60) return 'Just now';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}
let toastTimer;

// ── State ──────────────────────────────────────────────────────────────────
let settings          = {};
let allVersions       = [];
let selectedVersion   = '';
let currentFilter     = 'release';
let isLaunching       = false;
let selectedLoader    = 'vanilla';
let selectedLoaderVersion = '';
let profiles          = [];
let activeProfileId   = null;
let currentModProfile = '';
let browseOffset      = 0;
let browseTotal       = 0;
let browseQuery       = '';
let browseInstalling  = {};
let mpOffset          = 0;
let mpTotal           = 0;
let mpQuery           = '';
let mpInstalling      = {};
let screenshotsList   = [];
let lightboxIndex     = 0;
let currentScreenshotsGameDir = '';
let servers           = [];

// ── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  try { await loadSettings(); } catch(e) { console.error('loadSettings:', e); }
  setupNavigation();
  setupRamSlider();
  setupLoaderButtons();
  try { await loadVersions(); } catch(e) { console.error('loadVersions:', e); }
  try { await loadProfiles(); } catch(e) { console.error('loadProfiles:', e); }
  try { await checkJava(); } catch(e) { console.error('checkJava:', e); }
  try { await initMods(); } catch(e) { console.error('initMods:', e); }
  try { await initBrowse(); } catch(e) { console.error('initBrowse:', e); }
  try { await initScreenshots(); } catch(e) { console.error('initScreenshots:', e); }
  try { await initServers(); } catch(e) { console.error('initServers:', e); }
  try { await initWorlds(); } catch(e) { console.error('initWorlds:', e); }
  try { await initAssets(); } catch(e) { console.error('initAssets:', e); }
  setupFilterBtns();
  setupPlayBtn();
  setupSettingsSave();
  setupCrashModal();
  checkForUpdates();
  setupTitlebarUpdate();
})();

// ── Navigation ─────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
}
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  if (tab === 'screenshots') refreshScreenshots();
  if (tab === 'browse') refreshBrowseProfiles();
  if (tab === 'profiles') renderProfiles();
  if (tab === 'worlds') refreshWorlds();
  if (tab === 'assets') refreshAssetProfiles();
}

// ── Settings ───────────────────────────────────────────────────────────────
async function loadSettings() {
  settings = await window.launcher.getSettings();
  document.getElementById('usernameInput').value         = settings.username || 'Player';
  document.getElementById('settingsUsername').value      = settings.username || 'Player';
  document.getElementById('settingsJavaPath').value      = settings.javaPath || '';
  document.getElementById('settingsWidth').value         = settings.width    || 854;
  document.getElementById('settingsHeight').value        = settings.height   || 480;
  document.getElementById('settingsFullscreen').checked  = !!settings.fullscreen;
  document.getElementById('settingsUpdateRepo').value    = settings.updateRepo || '';
  document.getElementById('settingsCheckUpdate').checked = settings.checkUpdate !== false;
  const ram = settings.ram || 2048;
  document.getElementById('ramSlider').value = ram;
  document.getElementById('ramLabel').textContent = formatRam(ram);
}
function setupRamSlider() {
  document.getElementById('ramSlider').addEventListener('input', (e) =>
    document.getElementById('ramLabel').textContent = formatRam(e.target.value));
  document.getElementById('ramSuggestBtn').addEventListener('click', async () => {
    const info = await window.launcher.getSystemRam();
    document.getElementById('ramSlider').value = info.suggested;
    document.getElementById('ramLabel').textContent = formatRam(info.suggested);
    toast(`Suggested: ${formatRam(info.suggested)} (50% of ${formatRam(info.total / 1024 / 1024)})`, 'ok');
  });
}
function setupSettingsSave() {
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const s = {
      ...settings,
      username:    document.getElementById('settingsUsername').value.trim() || 'Player',
      ram:         parseInt(document.getElementById('ramSlider').value, 10),
      width:       parseInt(document.getElementById('settingsWidth').value, 10),
      height:      parseInt(document.getElementById('settingsHeight').value, 10),
      fullscreen:  document.getElementById('settingsFullscreen').checked,
      javaPath:    document.getElementById('settingsJavaPath').value.trim(),
      updateRepo:  document.getElementById('settingsUpdateRepo').value.trim(),
      checkUpdate: document.getElementById('settingsCheckUpdate').checked,
    };
    await window.launcher.saveSettings(s);
    settings = s;
    document.getElementById('usernameInput').value = s.username;
    toast('Settings saved!', 'ok');
  });
  document.getElementById('usernameInput').addEventListener('input', (e) =>
    document.getElementById('settingsUsername').value = e.target.value);
}

// ── Profiles ───────────────────────────────────────────────────────────────
async function loadProfiles() {
  profiles = await window.launcher.getProfiles();
  populateProfileSelects();
  renderRecentPlays();

  // Load active profile into home controls
  const activeProfile = profiles[0];
  if (activeProfile) {
    activeProfileId = activeProfile.id;
    loadProfileIntoControls(activeProfile);
  }
  document.getElementById('activeProfileSelect').addEventListener('change', (e) => {
    activeProfileId = e.target.value;
    const p = profiles.find(pr => pr.id === activeProfileId);
    if (p) loadProfileIntoControls(p);
  });
  document.getElementById('newProfileQuickBtn').addEventListener('click', () => {
    switchTab('profiles');
    showProfileForm();
  });
}

function populateProfileSelects() {
  const sel = document.getElementById('activeProfileSelect');
  sel.innerHTML = '';
  profiles.forEach(p => sel.appendChild(new Option(p.name, p.id)));
  if (activeProfileId) sel.value = activeProfileId;
  else if (profiles.length) sel.value = profiles[0].id;

  // Also populate mods/screenshots/browse profile selects
  ['modsProfileSelect', 'browseProfileSelect', 'mpInstallProfile', 'screenshotsProfileSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '<option value="">Select profile…</option>';
    profiles.forEach(p => el.appendChild(new Option(p.name, p.id)));
    if (prev && profiles.find(pr => pr.id === prev)) el.value = prev;
  });
}

function loadProfileIntoControls(profile) {
  if (!profile) return;
  // Set version
  const vSel = document.getElementById('versionSelect');
  if (profile.version && vSel.querySelector(`option[value="${profile.version}"]`))
    vSel.value = profile.version;
  selectedVersion = vSel.value;

  // Set loader
  document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
  const lb = document.querySelector(`.loader-btn[data-loader="${profile.loader || 'vanilla'}"]`);
  if (lb) { lb.classList.add('active'); selectedLoader = profile.loader || 'vanilla'; }

  selectedLoaderVersion = profile.loaderVersion || '';
  settings.ram = profile.ram || settings.ram;
  document.getElementById('ramSlider').value = settings.ram;
  document.getElementById('ramLabel').textContent = formatRam(settings.ram);

  updateLoaderVersionUI();
}

function updateLoaderVersionUI() {
  const wrap = document.getElementById('loaderVersionWrap');
  if (selectedLoader === 'vanilla') { wrap.style.display = 'none'; return; }
  if (selectedLoader === 'optifine') {
    wrap.style.display = '';
    document.getElementById('loaderVersionLabel').textContent = 'OPTIFINE';
    document.getElementById('loaderVersionSelect').innerHTML = '<option value="manual">Place OptiFine .jar in mods folder</option>';
    selectedLoaderVersion = 'manual'; return;
  }
  wrap.style.display = '';
  document.getElementById('loaderVersionLabel').textContent = selectedLoader === 'forge' ? 'FORGE VERSION' : 'FABRIC VERSION';
  if (selectedVersion) fetchLoaderVersions(selectedVersion);
}

function renderRecentPlays() {
  const sorted = [...profiles].filter(p => p.lastPlayed).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed)).slice(0, 4);
  const wrap = document.getElementById('recentPlays');
  const list = document.getElementById('recentList');
  if (!sorted.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  list.innerHTML = '';
  sorted.forEach(p => {
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.innerHTML = `
      <div class="recent-card-name">${escapeHtml(p.name)}</div>
      <div class="recent-card-meta">${escapeHtml(p.version || '?')} · ${escapeHtml(p.loader || 'vanilla')}</div>
      <div class="recent-card-time">${timeAgo(p.lastPlayed)}</div>`;
    card.addEventListener('click', () => {
      document.getElementById('activeProfileSelect').value = p.id;
      activeProfileId = p.id;
      loadProfileIntoControls(p);
    });
    list.appendChild(card);
  });
}

// ── Profiles tab ───────────────────────────────────────────────────────────
function renderProfiles() {
  const grid = document.getElementById('profilesGrid');
  grid.innerHTML = '';
  if (!profiles.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text3);padding:40px">No profiles yet. Create one!</p>';
    return;
  }
  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div class="profile-card-color"></div>
      <div class="profile-card-body">
        <div class="profile-card-name">${escapeHtml(p.name)}</div>
        <div class="profile-card-meta">
          <span class="pc-badge version">${escapeHtml(p.version || '?')}</span>
          <span class="pc-badge loader">${escapeHtml(p.loader || 'vanilla')}</span>
          <span class="pc-badge ram">${formatRam(p.ram || 2048)}</span>
        </div>
        <div class="profile-card-stats">
          <span>Played ${p.playCount || 0}×</span>
          <span>Last: ${timeAgo(p.lastPlayed)}</span>
        </div>
      </div>
      <div class="profile-card-actions">
        <button class="pc-btn play" title="Launch">▶</button>
        <button class="pc-btn edit" title="Edit">✏</button>
        <button class="pc-btn del" title="Delete">🗑</button>
      </div>`;
    card.querySelector('.pc-btn.play').addEventListener('click', () => {
      document.getElementById('activeProfileSelect').value = p.id;
      activeProfileId = p.id;
      loadProfileIntoControls(p);
      switchTab('home');
      launchGame();
    });
    card.querySelector('.pc-btn.edit').addEventListener('click', () => showProfileForm(p));
    card.querySelector('.pc-btn.del').addEventListener('click', async () => {
      if (!confirm(`Delete profile "${p.name}"?`)) return;
      const deleteFiles = confirm('Also delete game files?');
      await window.launcher.deleteProfile({ id: p.id, deleteFiles });
      profiles = await window.launcher.getProfiles();
      populateProfileSelects();
      renderProfiles();
      renderRecentPlays();
      toast(`Profile "${p.name}" deleted.`, 'ok');
    });
    grid.appendChild(card);
  });
}

function showProfileForm(profile = null) {
  const wrap  = document.getElementById('profileFormWrap');
  const title = document.getElementById('profileFormTitle');
  wrap.style.display = '';
  title.textContent = profile ? 'Edit Profile' : 'New Profile';
  document.getElementById('pfName').value    = profile?.name    || '';
  document.getElementById('pfVersion').value = profile?.version || (allVersions[0]?.id || '');
  document.getElementById('pfLoader').value  = profile?.loader  || 'vanilla';
  document.getElementById('pfRam').value     = profile?.ram     || 2048;
  document.getElementById('pfEditId').value  = profile?.id      || '';
  wrap.scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('createProfileBtn').addEventListener('click', () => showProfileForm());
  document.getElementById('profileFormCancel').addEventListener('click', () => {
    document.getElementById('profileFormWrap').style.display = 'none';
  });
  document.getElementById('pfRamSuggest').addEventListener('click', async () => {
    const info = await window.launcher.getSystemRam();
    document.getElementById('pfRam').value = info.suggested;
    toast(`Suggested: ${formatRam(info.suggested)}`, 'ok');
  });
  document.getElementById('profileFormSave').addEventListener('click', async () => {
    const editId  = document.getElementById('pfEditId').value;
    const name    = document.getElementById('pfName').value.trim();
    const version = document.getElementById('pfVersion').value;
    const loader  = document.getElementById('pfLoader').value;
    const ram     = parseInt(document.getElementById('pfRam').value, 10) || 2048;
    if (!name) return toast('Profile name required.', 'err');

    if (editId) {
      profiles = profiles.map(p => p.id === editId ? { ...p, name, version, loader, ram } : p);
      await window.launcher.saveProfiles(profiles);
    } else {
      await window.launcher.createProfile({ name, version, loader, ram });
      profiles = await window.launcher.getProfiles();
    }
    document.getElementById('profileFormWrap').style.display = 'none';
    populateProfileSelects();
    renderProfiles();
    renderRecentPlays();
    toast(`Profile "${name}" saved!`, 'ok');
  });
});

// ── Loader buttons ─────────────────────────────────────────────────────────
function setupLoaderButtons() {
  document.querySelectorAll('.loader-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.loader-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedLoader = btn.dataset.loader;
      selectedLoaderVersion = '';
      updateLoaderVersionUI();
      if (selectedLoader !== 'vanilla' && selectedLoader !== 'optifine' && selectedVersion)
        await fetchLoaderVersions(selectedVersion);
    }));
  document.getElementById('versionSelect').addEventListener('change', async (e) => {
    selectedVersion = e.target.value;
    syncVersionCards();
    if (selectedLoader !== 'vanilla' && selectedLoader !== 'optifine' && selectedVersion)
      await fetchLoaderVersions(selectedVersion);
  });
  document.getElementById('loaderVersionSelect').addEventListener('change', (e) =>
    selectedLoaderVersion = e.target.value);
}

async function fetchLoaderVersions(mcVersion) {
  const spinner = document.getElementById('loaderSpinner');
  const sel     = document.getElementById('loaderVersionSelect');
  spinner.style.display = '';
  sel.innerHTML = '<option value="">Loading…</option>';
  sel.disabled  = true;
  try {
    const list = await window.launcher.getLoaderVersions({ loader: selectedLoader, mcVersion });
    sel.innerHTML = '';
    if (!list.length) {
      sel.innerHTML = `<option value="">No ${selectedLoader} builds for ${mcVersion}</option>`;
    } else {
      list.forEach((v, i) => {
        const opt = new Option(v.label, v.id);
        if (i === 0) opt.selected = true;
        sel.appendChild(opt);
      });
      selectedLoaderVersion = list[0].id;
    }
  } catch { sel.innerHTML = '<option value="">Failed to load</option>'; }
  finally { spinner.style.display = 'none'; sel.disabled = false; }
}

function syncVersionCards() {
  document.querySelectorAll('.version-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.id === selectedVersion));
}

// ── Versions ───────────────────────────────────────────────────────────────
async function loadVersions() {
  try {
    const data = await window.launcher.getVersions();
    allVersions = data.versions;
    const latest = data.latest.release;
    populateVersionSelect(allVersions);
    renderVersionCards(allVersions.filter(v => v.type === 'release'));

    // Populate profile form version select
    const pfVer = document.getElementById('pfVersion');
    allVersions.filter(v => v.type === 'release').forEach(v => pfVer.appendChild(new Option(v.id, v.id)));

    // Populate browse version filters
    const releases = allVersions.filter(v => v.type === 'release').slice(0, 40);
    ['browseVersionFilter','mpVersionFilter','mpVersionFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      releases.forEach(v => el.appendChild(new Option(v.id, v.id)));
    });

    const sel = document.getElementById('versionSelect');
    sel.value = settings.version || latest;
    selectedVersion = sel.value;
  } catch (e) {
    setStatus(`Failed to fetch versions: ${e}`, 'error');
  }
}
function populateVersionSelect(list) {
  const sel = document.getElementById('versionSelect');
  sel.innerHTML = '';
  const grpR = document.createElement('optgroup'); grpR.label = 'Releases';
  list.filter(v => v.type === 'release').forEach(v => grpR.appendChild(new Option(v.id, v.id)));
  sel.appendChild(grpR);
  const snaps = list.filter(v => v.type === 'snapshot');
  if (snaps.length) {
    const grpS = document.createElement('optgroup'); grpS.label = 'Snapshots';
    snaps.forEach(v => grpS.appendChild(new Option(v.id, v.id)));
    sel.appendChild(grpS);
  }
}
function renderVersionCards(list) {
  const grid = document.getElementById('versionsGrid');
  grid.innerHTML = '';
  list.forEach((v, i) => {
    const card = document.createElement('div');
    card.className = `version-card${v.id === selectedVersion ? ' selected' : ''}`;
    card.dataset.id = v.id;
    card.style.animation = `fade-up 0.3s ${i * 0.015}s ease backwards`;
    card.innerHTML = `<div class="v-id">${v.id}</div><div class="v-type ${v.type}">${v.type.toUpperCase()}</div><div class="v-select-label">SELECTED</div>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.version-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedVersion = v.id;
      document.getElementById('versionSelect').value = v.id;
    });
    grid.appendChild(card);
  });
}
function setupFilterBtns() {
  document.querySelectorAll('.filter-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyVersionFilter();
    }));
  document.getElementById('versionSearch').addEventListener('input', applyVersionFilter);
}
function applyVersionFilter() {
  const q = (document.getElementById('versionSearch').value || '').toLowerCase().trim();
  let f = allVersions;
  if (currentFilter === 'release')   f = f.filter(v => v.type === 'release');
  else if (currentFilter === 'snapshot') f = f.filter(v => v.type === 'snapshot');
  else if (currentFilter === 'old')  f = f.filter(v => v.type === 'old_alpha' || v.type === 'old_beta');
  if (q) f = f.filter(v => v.id.toLowerCase().includes(q));
  renderVersionCards(f);
}

// ── Java ───────────────────────────────────────────────────────────────────
async function checkJava() {
  const s    = await window.launcher.getJavaStatus();
  const badge = document.getElementById('javaBadge');
  const dot   = badge.querySelector('.badge-dot');
  const title = document.getElementById('javaStatusTitle');
  const desc  = document.getElementById('javaStatusDesc');
  const pathEl = document.getElementById('javaPathText');
  const btn   = document.getElementById('javaActionBtn');

  if (s.installed && s.version >= 17) {
    dot.className = 'badge-dot ok';
    title.textContent = `✓ Adoptium JRE ${s.version} Installed`; title.style.color = 'var(--green)';
    desc.textContent = `Eclipse Temurin JRE ${s.version} ready.`; pathEl.textContent = s.path; btn.style.display = 'none';
  } else if (s.sysVersion >= 17) {
    dot.className = 'badge-dot ok';
    title.textContent = `✓ System Java ${s.sysVersion}`; title.style.color = 'var(--green)';
    desc.textContent = 'System Java will be used.'; pathEl.textContent = 'java (system PATH)';
    btn.style.display = ''; btn.textContent = 'Download Bundled JRE 21';
    btn.onclick = () => downloadJava(21);
  } else {
    dot.className = 'badge-dot err';
    const found = s.version || s.sysVersion;
    title.textContent = found ? `✗ Java ${found} — Too Old` : '✗ Java Not Found'; title.style.color = 'var(--danger)';
    desc.textContent = found ? `Need Java 17+ or 21+.` : 'No Java found. Download below.'; pathEl.textContent = s.path || '';
    btn.style.display = ''; btn.textContent = 'Download JRE 21'; btn.onclick = () => downloadJava(21);
  }
}

async function downloadJava(v = 21) {
  const btn   = document.getElementById('javaActionBtn');
  const area  = document.getElementById('javaDownloadArea');
  const fill  = document.getElementById('dlFill');
  const pct   = document.getElementById('dlPercent');
  const label = document.getElementById('dlLabel');
  btn.disabled = true; area.style.display = '';
  const unsub = window.launcher.on('download-progress', ({ type, status, percent, downloaded, total }) => {
    if (type !== 'java') return;
    if (status === 'extracting') { label.textContent = 'Extracting…'; fill.style.width = '100%'; pct.textContent = 'Extracting'; }
    else { label.textContent = `Downloading JRE ${v}… ${bytesStr(downloaded)} / ${bytesStr(total)}`; fill.style.width = percent + '%'; pct.textContent = percent + '%'; }
  });
  const r = await window.launcher.downloadJava({ version: v });
  unsub();
  if (r.success) { toast('Java installed!', 'ok'); await checkJava(); }
  else { toast(`Java failed: ${r.error}`, 'err'); btn.disabled = false; }
}
function bytesStr(b) {
  if (!b) return '?';
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1024).toFixed(0) + ' KB';
}

// ── Play ───────────────────────────────────────────────────────────────────
function setupPlayBtn() {
  document.getElementById('playBtn').addEventListener('click', launchGame);
  document.getElementById('cancelGameBtn').addEventListener('click', () => {
    if (!confirm('Stop the game?')) return;
    window.launcher.killGame();
    document.getElementById('cancelGameBtn').style.display = 'none';
    logLine('Game stopped by user.', 'err');
    setStatus('Stopped.', 'error');
    setProgress(0);
    resetPlayBtn();
  });
}

async function launchGame() {
  if (isLaunching) return;
  const username = document.getElementById('usernameInput').value.trim();
  if (!username || username.length < 3) return toast('Username must be 3+ chars.', 'err');
  const version = selectedVersion || document.getElementById('versionSelect').value;
  if (!version) { toast('Select a version first.', 'err'); switchTab('versions'); return; }
  if ((selectedLoader === 'forge' || selectedLoader === 'fabric') && !selectedLoaderVersion)
    return toast(`Select a ${selectedLoader} version first.`, 'err');

  isLaunching = true;
  const btn = document.getElementById('playBtn');
  btn.disabled = true; btn.classList.add('loading'); btn.querySelector('.play-text').textContent = 'LAUNCHING…';
  document.getElementById('cancelGameBtn').style.display = 'flex';
  setProgress(0); setStatus('Preparing…');
  logLine('Starting Nova Launcher…', 'ok');
  logLine(`v${version} | ${username} | ${selectedLoader}${selectedLoaderVersion ? ' ' + selectedLoaderVersion : ''}`, 'info');

  // Java check
  const js = await window.launcher.getJavaStatus();
  const needed = requiredJavaForMC(version);
  const hasJava = (js.installed && js.version >= needed) || (js.sysVersion >= needed);
  if (!hasJava && !settings.javaPath) {
    setStatus(`Downloading JRE ${needed}…`);
    const r = await window.launcher.downloadJava({ version: needed });
    if (!r.success) { logLine(`Java download failed: ${r.error}`, 'err'); setStatus(r.error, 'error'); resetPlayBtn(); return; }
    await checkJava();
  }

  // Get active profile's gameDir
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const gameDir = activeProfile?.gameDir || settings.gameDir || '';

  const unsubP = window.launcher.on('launch-progress', ({ type, task, total }) => {
    if (total > 0) { const p = Math.round((task / total) * 100); setProgress(p); setStatus(`${type}: ${task}/${total}`); }
  });
  const unsubL = window.launcher.on('launch-log',     ({ level, msg }) => logLine(String(msg).slice(0, 200), level === 'debug' ? 'debug' : 'info'));
  const unsubC = window.launcher.on('game-closed',    ({ code }) => {
    logLine(`Game exited (${code})`, code === 0 ? 'ok' : 'err');
    setStatus(code === 0 ? 'Game closed.' : `Crashed (exit ${code}).`, code === 0 ? '' : 'error');
    setProgress(0); resetPlayBtn(); unsubP(); unsubL(); unsubC(); unsubCrash();
    // Refresh profiles (lastPlayed updated)
    window.launcher.getProfiles().then(p => { profiles = p; populateProfileSelects(); renderRecentPlays(); });
  });
  const unsubCrash = window.launcher.on('game-crashed', ({ analysis, logName }) => {
    const crashAlert = document.getElementById('crashAlert');
    document.getElementById('crashAlertText').textContent = `Game crashed: ${analysis?.summary || 'Unknown error'}`;
    crashAlert.style.display = 'flex';
    crashAlert.dataset.analysis = JSON.stringify(analysis);
    crashAlert.dataset.logName  = logName || '';
  });

  const r = await window.launcher.launch({
    username, version,
    ram:          settings.ram        || 2048,
    javaPath:     settings.javaPath   || '',
    gameDir,
    width:        settings.width      || 854,
    height:       settings.height     || 480,
    fullscreen:   settings.fullscreen || false,
    loaderType:   selectedLoader,
    loaderVersion: selectedLoaderVersion,
    profileId:    activeProfileId,
  });

  if (!r.success) {
    logLine(`Launch error: ${r.error}`, 'err'); setStatus(r.error, 'error');
    setProgress(0); resetPlayBtn(); unsubP(); unsubL(); unsubC(); unsubCrash(); return;
  }
  setProgress(100); setStatus('Game launched!', 'success'); logLine('Launched!', 'ok');
  await refreshModProfiles();
  isLaunching = false; btn.classList.remove('loading'); btn.querySelector('.play-text').textContent = 'RUNNING';
}

function resetPlayBtn() {
  isLaunching = false;
  const btn = document.getElementById('playBtn');
  btn.disabled = false; btn.classList.remove('loading'); btn.querySelector('.play-text').textContent = 'PLAY';
  document.getElementById('cancelGameBtn').style.display = 'none';
}
function setStatus(t, type = '') { const el = document.getElementById('statusText'); el.textContent = t; el.className = `status-text${type ? ' ' + type : ''}`; }
function setProgress(p) { document.getElementById('progressFill').style.width = p + '%'; }
function logLine(msg, cls = 'info') {
  const body = document.getElementById('consoleBody');
  const div  = document.createElement('div');
  div.className = `log-line log-${cls}`;
  div.textContent = `[${new Date().toTimeString().slice(0,8)}] ${msg}`;
  body.appendChild(div); body.scrollTop = body.scrollHeight;
  while (body.children.length > 300) body.removeChild(body.firstChild);
}
function clearConsole() { document.getElementById('consoleBody').innerHTML = ''; }

// ── Crash modal ────────────────────────────────────────────────────────────
function setupCrashModal() {
  document.getElementById('crashAlertBtn').addEventListener('click', () => {
    const data = document.getElementById('crashAlert').dataset.analysis;
    if (data) showCrashModal(JSON.parse(data));
  });
  document.getElementById('crashAlertDismiss').addEventListener('click', () =>
    document.getElementById('crashAlert').style.display = 'none');
  document.getElementById('crashModalClose').addEventListener('click', () =>
    document.getElementById('crashModal').style.display = 'none');
}

function showCrashModal(analysis) {
  document.getElementById('crashModal').style.display = 'flex';
  document.getElementById('crashSummary').innerHTML = `<div class="crash-summary-text">${escapeHtml(analysis.summary || 'Unknown crash')}</div>`;
  document.getElementById('crashDetails').innerHTML = [
    analysis.errorType   ? `<div class="crash-detail"><span>Error</span><code>${escapeHtml(analysis.errorType)}: ${escapeHtml(analysis.errorMessage)}</code></div>` : '',
    analysis.culpritMod  ? `<div class="crash-detail"><span>Suspect</span><code>${escapeHtml(analysis.culpritMod)}</code></div>` : '',
    analysis.mcVersion   ? `<div class="crash-detail"><span>MC Version</span><code>${escapeHtml(analysis.mcVersion)}</code></div>` : '',
    analysis.javaVersion ? `<div class="crash-detail"><span>Java</span><code>${escapeHtml(analysis.javaVersion)}</code></div>` : '',
  ].join('');
  const stack = analysis.stackTrace || [];
  document.getElementById('crashStack').innerHTML = stack.length
    ? `<div class="crash-stack-label">Stack Trace</div><pre class="crash-stack-pre">${stack.map(escapeHtml).join('\n')}</pre>` : '';
}

// ── Mods ───────────────────────────────────────────────────────────────────
async function initMods() {
  await refreshModProfiles();
  document.getElementById('modsProfileSelect').addEventListener('change', async (e) => {
    currentModProfile = e.target.value;
    await renderMods();
  });
  document.getElementById('openModsFolderBtn').addEventListener('click', () => {
    if (!currentModProfile) return toast('Select a profile first.', 'err');
    const gd = getGameDirForModProfile();
    window.launcher.openModsFolder({ gameDir: gd });
  });
  document.getElementById('checkUpdatesBtn').addEventListener('click', checkModUpdates);
  document.getElementById('checkConflictsBtn').addEventListener('click', checkModConflicts);
  document.getElementById('modUpdatesDismiss').addEventListener('click', () =>
    document.getElementById('modUpdatesBar').style.display = 'none');
  document.getElementById('modConflictsDismiss').addEventListener('click', () =>
    document.getElementById('modConflictsBar').style.display = 'none');
  setupModFileInput(); setupModDragDrop();
}

function getGameDirForModProfile() {
  const ap = profiles.find(p => p.id === currentModProfile)
           || profiles.find(p => p.id === activeProfileId);
  return (ap && ap.gameDir && ap.gameDir !== '') ? ap.gameDir : '';
}

async function refreshModProfiles() {
  // modsProfileSelect is already populated by loadProfiles() — just sync currentModProfile
  const sel = document.getElementById('modsProfileSelect');
  if (!sel.value && activeProfileId) sel.value = activeProfileId;
  if (sel.value && sel.value !== currentModProfile) {
    currentModProfile = sel.value;
    await renderMods();
  }
}

async function renderMods() {
  const empty = document.getElementById('modsEmpty');
  const list  = document.getElementById('modsList');
  const body  = document.getElementById('modsListBody');
  if (!currentModProfile) { empty.style.display = ''; list.style.display = 'none'; return; }
  empty.style.display = 'none'; list.style.display = '';
  const gd   = getGameDirForModProfile();
  const mods = await window.launcher.getMods({ gameDir: gd });
  body.innerHTML = '';
  if (!mods.length) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">No mods installed.</div>'; return;
  }
  mods.forEach((mod, i) => {
    const row = document.createElement('div');
    row.className = `mod-row${mod.enabled ? '' : ' disabled'}`;
    row.style.animationDelay = `${i * 0.03}s`;
    row.innerHTML = `
      <div class="mod-name" title="${mod.name}">${mod.name}</div>
      <div class="mod-size">${formatBytes(mod.size)}</div>
      <div><label class="toggle"><input type="checkbox" ${mod.enabled ? 'checked' : ''}/><span class="toggle-slider"></span></label></div>
      <button class="mod-delete" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/></svg></button>`;
    row.querySelector('input').addEventListener('change', async (e) => {
      await window.launcher.toggleMod({ gameDir: gd, file: mod.file, enabled: e.target.checked });
      mod.enabled = e.target.checked; row.classList.toggle('disabled', !mod.enabled);
      mod.file = e.target.checked ? mod.file.replace('.disabled','') : mod.file + '.disabled';
    });
    row.querySelector('.mod-delete').addEventListener('click', async () => {
      if (!confirm(`Delete ${mod.name}?`)) return;
      await window.launcher.deleteMod({ gameDir: gd, file: mod.file });
      await renderMods(); toast(`Deleted ${mod.name}`, 'ok');
    });
    body.appendChild(row);
  });
}

async function checkModUpdates() {
  if (!currentModProfile) return toast('Select a profile first.', 'err');
  const bar = document.getElementById('modUpdatesBar');
  const txt = document.getElementById('modUpdatesText');
  bar.style.display = ''; txt.textContent = 'Checking for mod updates…';
  document.getElementById('updateAllModsBtn').style.display = 'none';
  const gd = getGameDirForModProfile();
  const r  = await window.launcher.checkModUpdates({ gameDir: gd });
  if (r.error) { txt.textContent = `Error: ${r.error}`; return; }
  if (!r.updates.length) {
    txt.textContent = `All ${r.checked} mods are up to date ✓`;
  } else {
    txt.textContent = `${r.updates.length} update${r.updates.length > 1 ? 's' : ''} available (${r.checked} mods checked)`;
    const allBtn = document.getElementById('updateAllModsBtn');
    allBtn.style.display = '';
    allBtn.onclick = async () => {
      allBtn.disabled = true; allBtn.textContent = 'Updating…';
      for (const u of r.updates) {
        await window.launcher.updateMod({ gameDir: gd, oldFilename: u.filename, newFileUrl: u.latestFileUrl, newFilename: u.latestFilename });
        toast(`Updated: ${u.filename} → ${u.latestVersion}`, 'ok');
      }
      await renderMods(); txt.textContent = `Updated ${r.updates.length} mod${r.updates.length > 1 ? 's' : ''} ✓`;
      allBtn.style.display = 'none'; allBtn.disabled = false;
    };
  }
}

function setupModFileInput() {
  document.getElementById('modFileInput').addEventListener('change', async (e) => {
    if (!currentModProfile) return toast('Select a profile first.', 'err');
    const gd = getGameDirForModProfile();
    for (const f of e.target.files) await window.launcher.addMod({ gameDir: gd, srcPath: f.path });
    await renderMods(); toast(`Added ${e.target.files.length} mod(s)`, 'ok'); e.target.value = '';
  });
}

function setupModDragDrop() {
  const dz  = document.getElementById('modDropzone');
  const tab = document.getElementById('tab-mods');
  tab.addEventListener('dragover',   e => { e.preventDefault(); dz.classList.add('active'); });
  tab.addEventListener('dragleave',  e => { if (!tab.contains(e.relatedTarget)) dz.classList.remove('active'); });
  tab.addEventListener('drop', async e => {
    e.preventDefault(); dz.classList.remove('active');
    if (!currentModProfile) return toast('Select a profile first.', 'err');
    const files = [...e.dataTransfer.files].filter(f => f.name.endsWith('.jar'));
    if (!files.length) return toast('Only .jar files.', 'err');
    const gd = getGameDirForModProfile();
    for (const f of files) await window.launcher.addMod({ gameDir: gd, srcPath: f.path });
    await renderMods(); toast(`Added ${files.length} mod(s)`, 'ok');
  });
}

// ── Browse (mods + modpacks) ───────────────────────────────────────────────
async function initBrowse() {
  await refreshBrowseProfiles();

  // Sub-tab switching
  document.querySelectorAll('.browse-tab[data-btab]').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.browse-tab[data-btab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.browse-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('browse-' + btn.dataset.btab)?.classList.add('active');
    }));

  // Mods search
  document.getElementById('browseSearchBtn').addEventListener('click', () => { browseOffset = 0; browseQuery = document.getElementById('browseSearchInput').value.trim(); executeBrowseSearch(false); });
  document.getElementById('browseSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { browseOffset = 0; browseQuery = document.getElementById('browseSearchInput').value.trim(); executeBrowseSearch(false); } });
  document.getElementById('browseLoadMoreBtn').addEventListener('click', () => { browseOffset += 20; executeBrowseSearch(true); });

  // Modpacks search
  document.getElementById('mpSearchBtn').addEventListener('click', () => { mpOffset = 0; mpQuery = document.getElementById('mpSearchInput').value.trim(); executeMpSearch(false); });
  document.getElementById('mpSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { mpOffset = 0; mpQuery = document.getElementById('mpSearchInput').value.trim(); executeMpSearch(false); } });
  document.getElementById('mpLoadMoreBtn').addEventListener('click', () => { mpOffset += 20; executeMpSearch(true); });

  document.getElementById('importPackBtn').addEventListener('click', async () => {
    const r = await window.launcher.openFileDialog({ filters: [{ name: 'Modpack', extensions: ['zip', 'mrpack'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths.length) return;
    const profile = document.getElementById('mpInstallProfile').value;
    if (!profile) return toast('Select an install profile first.', 'err');
    const ap  = profiles.find(p => p.id === profile);
    const res = await window.launcher.importModpack({ zipPath: r.filePaths[0], gameDir: ap?.gameDir });
    if (res.success) toast('Modpack imported!', 'ok'); else toast(`Import failed: ${res.error}`, 'err');
  });
}

async function refreshBrowseProfiles() {
  const selectors = ['browseProfileSelect', 'mpInstallProfile'];
  selectors.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '<option value="">Select profile…</option>';
    profiles.forEach(p => el.appendChild(new Option(p.name, p.id)));
    if (prev && profiles.find(pr => pr.id === prev)) el.value = prev;
    else if (activeProfileId) el.value = activeProfileId;
  });
}

async function executeBrowseSearch(append) {
  const q  = browseQuery;
  const mv = document.getElementById('browseVersionFilter').value;
  const ld = document.getElementById('browseLoaderFilter').value;
  showBrowseState('mods', 'loading');
  const r = await window.launcher.searchModrinth({ query: q, mcVersion: mv, loader: ld, offset: browseOffset });
  if (r.error) { document.getElementById('browseErrorMsg').textContent = r.error; showBrowseState('mods', 'error'); return; }
  browseTotal = r.total;
  if (!r.hits.length && !append) { document.getElementById('browseErrorMsg').textContent = 'No mods found.'; showBrowseState('mods', 'error'); return; }
  showBrowseState('mods', 'results');
  document.getElementById('browseResultsMeta').style.display = '';
  document.getElementById('browseResultsCount').textContent = `${r.total.toLocaleString()} results${q ? ` for "${q}"` : ''}`;
  const grid = document.getElementById('browseGrid');
  if (!append) grid.innerHTML = '';
  r.hits.forEach((h, i) => grid.appendChild(createModCard(h, i, 'mod')));
  const shown = browseOffset + r.hits.length;
  const lm = document.getElementById('browseLoadMore');
  document.getElementById('browseLoadMoreMeta').textContent = `${shown} of ${r.total.toLocaleString()}`;
  lm.style.display = shown < browseTotal ? '' : 'none';
}

async function executeMpSearch(append) {
  const q  = mpQuery;
  const mv = document.getElementById('mpVersionFilter').value;
  showBrowseState('modpacks', 'loading');
  const r = await window.launcher.searchModrinthModpacks({ query: q, mcVersion: mv, offset: mpOffset });
  if (r.error) { document.getElementById('mpErrorMsg').textContent = r.error; showBrowseState('modpacks', 'error'); return; }
  mpTotal = r.total;
  if (!r.hits.length && !append) { document.getElementById('mpErrorMsg').textContent = 'No modpacks found.'; showBrowseState('modpacks', 'error'); return; }
  showBrowseState('modpacks', 'results');
  const grid = document.getElementById('mpGrid');
  if (!append) grid.innerHTML = '';
  r.hits.forEach((h, i) => grid.appendChild(createModCard(h, i, 'modpack')));
  const shown = mpOffset + r.hits.length;
  const lm = document.getElementById('mpLoadMore');
  document.getElementById('mpLoadMoreMeta').textContent = `${shown} of ${r.total.toLocaleString()}`;
  lm.style.display = shown < mpTotal ? '' : 'none';
}

function createModCard(hit, index, type) {
  const card = document.createElement('div');
  card.className = 'mod-card'; card.style.animationDelay = `${index * 0.03}s`;
  const cats = (hit.categories || []).slice(0, 3).map(c => `<span class="mod-cat">${c}</span>`).join('');
  const icon = hit.icon_url
    ? `<img class="mod-card-icon" src="${hit.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><div class="mod-card-icon-fallback" style="display:none">${hit.title.charAt(0)}</div>`
    : `<div class="mod-card-icon-fallback">${hit.title.charAt(0)}</div>`;
  const installing = type === 'mod' ? browseInstalling : mpInstalling;
  card.innerHTML = `
    <div class="mod-card-top">
      <div class="mod-card-icon-wrap">${icon}</div>
      <div class="mod-card-meta"><div class="mod-card-title">${escapeHtml(hit.title)}</div><div class="mod-card-author">by ${escapeHtml(hit.author)}</div></div>
      <div class="mod-card-dl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${formatDownloads(hit.downloads)}</div>
    </div>
    <p class="mod-card-desc">${escapeHtml(hit.description || '')}</p>
    <div class="mod-card-footer"><div class="mod-card-cats">${cats}</div><button class="mod-install-btn" data-id="${hit.project_id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${type === 'modpack' ? 'Install Pack' : 'Install'}</button></div>`;
  card.querySelector('.mod-install-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (type === 'mod') installModrinthMod(hit.project_id, hit.title, card.querySelector('.mod-install-btn'));
    else installModrinthModpack(hit.project_id, hit.title, card.querySelector('.mod-install-btn'));
  });
  return card;
}

async function installModrinthMod(projectId, title, btn) {
  if (browseInstalling[projectId]) return;
  const profileId = document.getElementById('browseProfileSelect').value;
  const mv  = document.getElementById('browseVersionFilter').value;
  const ld  = document.getElementById('browseLoaderFilter').value;
  if (!profileId) return toast('Select an install profile.', 'err');
  const ap = profiles.find(p => p.id === profileId);
  // Need a loader-versioned mod profile (mods subfolder)
  const profile = ''; // mods now go directly to gameDir/mods/
  browseInstalling[projectId] = true;
  btn.disabled = true; btn.classList.add('installing'); btn.innerHTML = '<div class="spinner" style="width:10px;height:10px;border-width:2px"></div> Installing…';
  const r = await window.launcher.installModrinthMod({ projectId, mcVersion: mv, loader: ld, gameDir: ap?.gameDir });
  browseInstalling[projectId] = false;
  if (r.success) { btn.innerHTML = '✓ Installed'; btn.classList.remove('installing'); btn.classList.add('installed'); toast(`${title} installed!`, 'ok'); }
  else { btn.disabled = false; btn.classList.remove('installing'); btn.innerHTML = 'Install'; toast(`Failed: ${r.error}`, 'err'); }
}

async function installModrinthModpack(projectId, title, btn) {
  if (mpInstalling[projectId]) return;
  const profileId = document.getElementById('mpInstallProfile').value;
  if (!profileId) return toast('Select an install profile.', 'err');
  const ap = profiles.find(p => p.id === profileId);
  mpInstalling[projectId] = true;
  btn.disabled = true; btn.classList.add('installing'); btn.innerHTML = '<div class="spinner" style="width:10px;height:10px;border-width:2px"></div> Installing…';
  const r = await window.launcher.installModrinthModpack({ projectId, gameDir: ap?.gameDir });
  mpInstalling[projectId] = false;
  if (r.success) { btn.innerHTML = '✓ Installed'; btn.classList.remove('installing'); btn.classList.add('installed'); toast(`${title} installed!`, 'ok'); }
  else { btn.disabled = false; btn.classList.remove('installing'); btn.innerHTML = 'Install Pack'; toast(`Failed: ${r.error}`, 'err'); }
}

function showBrowseState(section, state) {
  const prefix = section === 'mods' ? 'browse' : 'mp';
  const ids = {
    empty:   `${prefix}EmptyState`,
    loading: `${prefix}LoadingState`,
    error:   `${prefix}ErrorState`,
    results: section === 'mods' ? 'browseGrid' : 'mpGrid',
  };
  Object.entries(ids).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = k === state ? '' : 'none';
  });
  if (state !== 'results') {
    if (section === 'mods') { document.getElementById('browseResultsMeta').style.display = 'none'; document.getElementById('browseLoadMore').style.display = 'none'; }
    else document.getElementById('mpLoadMore').style.display = 'none';
  }
}

// ── Screenshots ────────────────────────────────────────────────────────────
async function initScreenshots() {
  document.getElementById('screenshotsProfileSelect').addEventListener('change', async (e) => {
    const p = profiles.find(pr => pr.id === e.target.value);
    currentScreenshotsGameDir = p?.gameDir || '';
    await refreshScreenshots();
  });
  document.getElementById('openScreensFolderBtn').addEventListener('click', () => {
    if (currentScreenshotsGameDir) window.launcher.openScreenshotsFolder({ gameDir: currentScreenshotsGameDir });
  });
  document.getElementById('refreshScreensBtn').addEventListener('click', refreshScreenshots);
  document.getElementById('lightboxBg').addEventListener('click', closeLightbox);
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => showLightbox(lightboxIndex - 1));
  document.getElementById('lightboxNext').addEventListener('click', () => showLightbox(lightboxIndex + 1));
  document.getElementById('lightboxOpenBtn').addEventListener('click', () => {
    if (screenshotsList[lightboxIndex]) window.launcher.openScreenshot({ filePath: screenshotsList[lightboxIndex].fullPath });
  });
  document.addEventListener('keydown', e => {
    if (document.getElementById('lightbox').style.display === 'none') return;
    if (e.key === 'ArrowLeft')  showLightbox(lightboxIndex - 1);
    if (e.key === 'ArrowRight') showLightbox(lightboxIndex + 1);
    if (e.key === 'Escape')     closeLightbox();
  });
}

async function refreshScreenshots() {
  if (!currentScreenshotsGameDir) {
    showScreenshotState('empty'); return;
  }
  showScreenshotState('loading');
  const list = await window.launcher.getScreenshots({ gameDir: currentScreenshotsGameDir });
  screenshotsList = list;
  if (!list.length) { showScreenshotState('none'); return; }
  showScreenshotState('grid');
  const grid = document.getElementById('screenshotsGrid');
  grid.innerHTML = '';
  list.forEach((img, i) => {
    const card = document.createElement('div');
    card.className = 'screenshot-card';
    card.style.animationDelay = `${i * 0.04}s`;
    // Use nova:// protocol for local file access
    const srcUrl = `nova://localhost${img.fullPath.startsWith('/') ? img.fullPath : '/' + img.fullPath}`;
    card.innerHTML = `
      <img src="${srcUrl}" alt="${escapeHtml(img.name)}" loading="lazy" class="screenshot-img"/>
      <div class="screenshot-overlay">
        <div class="screenshot-name">${escapeHtml(img.name)}</div>
        <div class="screenshot-size">${formatBytes(img.size)}</div>
      </div>`;
    card.addEventListener('click', () => showLightbox(i));
    grid.appendChild(card);
  });
}

function showLightbox(index) {
  const list = screenshotsList;
  if (!list.length) return;
  lightboxIndex = (index + list.length) % list.length;
  const img = list[lightboxIndex];
  const srcUrl = `nova://localhost${img.fullPath.startsWith('/') ? img.fullPath : '/' + img.fullPath}`;
  document.getElementById('lightboxImg').src = srcUrl;
  document.getElementById('lightboxCaption').textContent = img.name;
  document.getElementById('lightbox').style.display = 'flex';
  document.getElementById('lightboxPrev').style.display = list.length > 1 ? '' : 'none';
  document.getElementById('lightboxNext').style.display = list.length > 1 ? '' : 'none';
}
function closeLightbox() { document.getElementById('lightbox').style.display = 'none'; }

function showScreenshotState(state) {
  document.getElementById('screenshotsEmpty').style.display   = state === 'empty'   ? '' : 'none';
  document.getElementById('screenshotsLoading').style.display = state === 'loading' ? '' : 'none';
  document.getElementById('screenshotsNone').style.display    = state === 'none'    ? '' : 'none';
  document.getElementById('screenshotsGrid').style.display    = state === 'grid'    ? '' : 'none';
}

// ── Servers ────────────────────────────────────────────────────────────────
async function initServers() {
  servers = await window.launcher.getServers();
  renderServers();
  document.getElementById('addServerBtn').addEventListener('click', () => {
    const w = document.getElementById('serverFormWrap');
    w.style.display = w.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('serverFormSave').addEventListener('click', addServer);
  document.getElementById('serverFormCancel').addEventListener('click', () =>
    document.getElementById('serverFormWrap').style.display = 'none');
  document.getElementById('pingAllBtn').addEventListener('click', pingAllServers);
}

async function addServer() {
  const name = document.getElementById('serverName').value.trim();
  const addr = document.getElementById('serverAddr').value.trim();
  if (!addr) return toast('Enter a server address.', 'err');
  const [host, portStr] = addr.includes(':') ? addr.split(':') : [addr, '25565'];
  servers.push({ id: Date.now().toString(36), name: name || addr, host, port: parseInt(portStr, 10) || 25565, status: null });
  await window.launcher.saveServers(servers);
  document.getElementById('serverName').value = '';
  document.getElementById('serverAddr').value = '';
  document.getElementById('serverFormWrap').style.display = 'none';
  renderServers();
  pingServer(servers[servers.length - 1]);
}

async function pingServer(server) {
  const card = document.querySelector(`.server-card[data-id="${server.id}"]`);
  if (card) { card.querySelector('.server-status').className = 'server-status pinging'; card.querySelector('.server-status-text').textContent = 'Pinging…'; }
  const r = await window.launcher.pingServer({ host: server.host, port: server.port });
  Object.assign(server, { status: r });
  await window.launcher.saveServers(servers);
  if (card) updateServerCard(card, server);
}

async function pingAllServers() {
  for (const s of servers) await pingServer(s);
  toast('All servers pinged.', 'ok');
}

function renderServers() {
  const empty = document.getElementById('serversEmpty');
  const list  = document.getElementById('serversList');
  if (!servers.length) { empty.style.display = ''; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = '';
  servers.forEach(s => {
    const card = document.createElement('div');
    card.className = 'server-card'; card.dataset.id = s.id;
    card.innerHTML = `
      <div class="server-status ${s.status?.online ? 'online' : s.status ? 'offline' : ''}"></div>
      <div class="server-info">
        <div class="server-name">${escapeHtml(s.name)}</div>
        <div class="server-addr">${escapeHtml(s.host)}:${s.port}</div>
      </div>
      <div class="server-details">
        <div class="server-status-text">${s.status ? (s.status.online ? s.status.motd || 'Online' : `Offline: ${s.status.error || ''}`) : 'Not pinged'}</div>
        <div class="server-players">${s.status?.online ? `${s.status.players.online}/${s.status.players.max} players · ${s.status.version}` : ''}</div>
      </div>
      <div class="server-actions">
        <button class="icon-btn" title="Ping">↻</button>
        <button class="icon-btn danger" title="Remove">✕</button>
      </div>`;
    card.querySelector('.icon-btn').addEventListener('click', () => pingServer(s));
    card.querySelector('.icon-btn.danger').addEventListener('click', async () => {
      servers = servers.filter(sv => sv.id !== s.id);
      await window.launcher.saveServers(servers); renderServers();
    });
    list.appendChild(card);
  });
}

function updateServerCard(card, server) {
  const s = server.status;
  card.querySelector('.server-status').className = `server-status ${s?.online ? 'online' : s ? 'offline' : ''}`;
  card.querySelector('.server-status-text').textContent = s ? (s.online ? s.motd || 'Online' : `Offline: ${s.error || ''}`) : 'Not pinged';
  card.querySelector('.server-players').textContent = s?.online ? `${s.players.online}/${s.players.max} players · ${s.version}` : '';
}

// ── Update checker ─────────────────────────────────────────────────────────
async function checkForUpdates() {
  if (settings.checkUpdate === false) return;
  const repo = settings.updateRepo;
  if (!repo) return;
  const r = await window.launcher.checkUpdate({ repo });
  if (r.hasUpdate) {
    const banner = document.getElementById('updateBanner');
    document.getElementById('updateText').textContent = `v${r.latest} available`;
    document.getElementById('updateLink').href = r.releaseUrl;
    document.getElementById('updateLink').addEventListener('click', e => { e.preventDefault(); window.open(r.releaseUrl); });
    banner.style.display = 'flex';
  }
}

function setupTitlebarUpdate() {
  document.getElementById('updateDismiss').addEventListener('click', () =>
    document.getElementById('updateBanner').style.display = 'none');
}

// ── Java tab (keep existing) ───────────────────────────────────────────────
async function checkJavaTab() { await checkJava(); }

// ── Toast ──────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Worlds ────────────────────────────────────────────────────────────────────
let currentWorldsGameDir = '';

async function initWorlds() {
  document.getElementById('worldsProfileSelect').addEventListener('change', async (e) => {
    const p = profiles.find(pr => pr.id === e.target.value);
    currentWorldsGameDir = (p && p.gameDir) ? p.gameDir : '';
    await refreshWorlds();
  });
  document.getElementById('refreshWorldsBtn').addEventListener('click', refreshWorlds);
}

async function refreshWorlds() {
  if (!currentWorldsGameDir) { showWorldState('empty'); return; }
  showWorldState('loading');
  const worlds = await window.launcher.getWorlds({ gameDir: currentWorldsGameDir });
  if (!worlds.length) { showWorldState('none'); return; }
  showWorldState('grid');
  const grid = document.getElementById('worldsGrid');
  grid.innerHTML = '';
  worlds.forEach((w, i) => {
    const card = document.createElement('div');
    card.className = 'world-card';
    card.style.animationDelay = `${i * 0.04}s`;
    const lastDate = w.lastPlayed ? new Date(w.lastPlayed).toLocaleDateString() : 'Unknown';
    card.innerHTML = `
      <div class="world-card-icon">🌍</div>
      <div class="world-card-body">
        <div class="world-card-name">${escapeHtml(w.levelName || w.folder)}</div>
        <div class="world-card-meta">
          <span class="wc-badge">${escapeHtml(w.gameType || 'Unknown')}</span>
          ${w.seed ? `<span class="wc-badge seed" title="Seed">🌱 ${escapeHtml(String(w.seed).slice(0, 12))}</span>` : ''}
        </div>
        <div class="world-card-date">Last played: ${lastDate}</div>
      </div>
      <div class="world-card-actions">
        <button class="wc-btn" title="Open folder">📂</button>
        <button class="wc-btn" title="Backup world">💾</button>
        <button class="wc-btn danger" title="Delete world">🗑</button>
      </div>`;
    const [btnOpen, btnBackup, btnDel] = card.querySelectorAll('.wc-btn');
    btnOpen.addEventListener('click', () =>
      window.launcher.openWorldFolder({ worldPath: w.path }));
    btnBackup.addEventListener('click', async () => {
      btnBackup.textContent = '⏳';
      const r = await window.launcher.backupWorld({ worldPath: w.path, worldName: w.levelName || w.folder });
      btnBackup.textContent = '💾';
      if (r.success) toast(`Backed up to: ${r.path}`, 'ok');
      else toast(`Backup failed: ${r.error}`, 'err');
    });
    btnDel.addEventListener('click', async () => {
      if (!confirm(`Delete world "${w.levelName || w.folder}"? This cannot be undone!`)) return;
      await window.launcher.deleteWorld({ worldPath: w.path });
      await refreshWorlds();
      toast('World deleted.', 'ok');
    });
    grid.appendChild(card);
  });
}

function showWorldState(state) {
  document.getElementById('worldsEmpty').style.display   = state === 'empty'   ? '' : 'none';
  document.getElementById('worldsLoading').style.display = state === 'loading' ? '' : 'none';
  document.getElementById('worldsNone').style.display    = state === 'none'    ? '' : 'none';
  document.getElementById('worldsGrid').style.display    = state === 'grid'    ? '' : 'none';
}

// ── Assets (ResourcePacks + ShaderPacks) ──────────────────────────────────────
let currentRpGameDir = '';
let currentSpGameDir = '';

async function initAssets() {
  // Outer sub-tab switching (Resource Packs / Shader Packs)
  document.querySelectorAll('.browse-tab[data-atab]').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.browse-tab[data-atab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.assets-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('assets-' + btn.dataset.atab)?.classList.add('active');
    }));

  // Inner sub-tabs: Installed / Browse (Resource Packs)
  document.querySelectorAll('.assets-inner-tab[data-rptab]').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.assets-inner-tab[data-rptab]').forEach(b => b.classList.remove('active'));
      document.getElementById('rp-installed').classList.remove('active');
      document.getElementById('rp-browse').classList.remove('active');
      btn.classList.add('active');
      document.getElementById('rp-' + btn.dataset.rptab)?.classList.add('active');
    }));

  // Inner sub-tabs: Installed / Browse (Shader Packs)
  document.querySelectorAll('.assets-inner-tab[data-sptab]').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.assets-inner-tab[data-sptab]').forEach(b => b.classList.remove('active'));
      document.getElementById('sp-installed').classList.remove('active');
      document.getElementById('sp-browse').classList.remove('active');
      btn.classList.add('active');
      document.getElementById('sp-' + btn.dataset.sptab)?.classList.add('active');
    }));

  document.getElementById('rpProfileSelect').addEventListener('change', async (e) => {
    const p = profiles.find(pr => pr.id === e.target.value);
    currentRpGameDir = (p && p.gameDir) ? p.gameDir : '';
    await refreshResourcePacks();
  });
  document.getElementById('spProfileSelect').addEventListener('change', async (e) => {
    const p = profiles.find(pr => pr.id === e.target.value);
    currentSpGameDir = (p && p.gameDir) ? p.gameDir : '';
    await refreshShaderPacks();
  });
  document.getElementById('openRpFolderBtn').addEventListener('click', () => {
    if (currentRpGameDir) window.launcher.openResourcePacksFolder({ gameDir: currentRpGameDir });
    else toast('Select a profile first.', 'err');
  });
  document.getElementById('openSpFolderBtn').addEventListener('click', () => {
    if (currentSpGameDir) window.launcher.openShaderPacksFolder({ gameDir: currentSpGameDir });
    else toast('Select a profile first.', 'err');
  });
  document.getElementById('rpFileInput').addEventListener('change', async (e) => {
    if (!currentRpGameDir) return toast('Select a profile first.', 'err');
    for (const f of e.target.files)
      await window.launcher.addResourcePack({ gameDir: currentRpGameDir, srcPath: f.path });
    await refreshResourcePacks();
    toast('Resource pack added!', 'ok');
    e.target.value = '';
  });
  document.getElementById('spFileInput').addEventListener('change', async (e) => {
    if (!currentSpGameDir) return toast('Select a profile first.', 'err');
    for (const f of e.target.files)
      await window.launcher.addShaderPack({ gameDir: currentSpGameDir, srcPath: f.path });
    await refreshShaderPacks();
    toast('Shader pack added!', 'ok');
    e.target.value = '';
  });

  // ── Browse wiring ────────────────────────────────────────────────────────
  let rpBrowseOffset = 0, spBrowseOffset = 0;
  const rpInstalling = {}, spInstalling = {};

  async function doRpSearch(append) {
    const q  = document.getElementById('rpBrowseSearch').value.trim();
    const mv = document.getElementById('rpBrowseVersion').value;
    if (!append) { rpBrowseOffset = 0; document.getElementById('rpBrowseResults').innerHTML = ''; }
    const res = await window.launcher.searchModrinthResourcePacks({ query: q, mcVersion: mv, offset: rpBrowseOffset });
    renderAssetCards(res.hits || [], 'rpBrowseResults', rpInstalling, async (id, title, btn) => {
      const profileId = document.getElementById('rpBrowseInstallProfile').value;
      if (!profileId) return toast('Select install profile first.', 'err');
      const p = profiles.find(pr => pr.id === profileId);
      rpInstalling[id] = true; btn.disabled = true; btn.classList.add('installing'); btn.textContent = 'Installing…';
      const r = await window.launcher.installModrinthResourcePack({ projectId: id, mcVersion: mv, gameDir: p?.gameDir || '' });
      rpInstalling[id] = false;
      if (r.success) { btn.textContent = '✓ Installed'; btn.classList.add('installed'); btn.disabled = true; toast(`${title} installed!`, 'ok'); }
      else { btn.disabled = false; btn.classList.remove('installing'); btn.textContent = 'Install'; toast(`Failed: ${r.error}`, 'err'); }
    });
    document.getElementById('rpLoadMoreBar').style.display = (res.hits?.length === 20) ? '' : 'none';
  }

  async function doSpSearch(append) {
    const q  = document.getElementById('spBrowseSearch').value.trim();
    const mv = document.getElementById('spBrowseVersion').value;
    if (!append) { spBrowseOffset = 0; document.getElementById('spBrowseResults').innerHTML = ''; }
    const res = await window.launcher.searchModrinthShaderPacks({ query: q, mcVersion: mv, offset: spBrowseOffset });
    renderAssetCards(res.hits || [], 'spBrowseResults', spInstalling, async (id, title, btn) => {
      const profileId = document.getElementById('spBrowseInstallProfile').value;
      if (!profileId) return toast('Select install profile first.', 'err');
      const p = profiles.find(pr => pr.id === profileId);
      spInstalling[id] = true; btn.disabled = true; btn.classList.add('installing'); btn.textContent = 'Installing…';
      const r = await window.launcher.installModrinthShaderPack({ projectId: id, mcVersion: mv, gameDir: p?.gameDir || '' });
      spInstalling[id] = false;
      if (r.success) { btn.textContent = '✓ Installed'; btn.classList.add('installed'); btn.disabled = true; toast(`${title} installed!`, 'ok'); }
      else { btn.disabled = false; btn.classList.remove('installing'); btn.textContent = 'Install'; toast(`Failed: ${r.error}`, 'err'); }
    });
    document.getElementById('spLoadMoreBar').style.display = (res.hits?.length === 20) ? '' : 'none';
  }

  document.getElementById('rpBrowseSearchBtn').addEventListener('click', () => doRpSearch(false));
  document.getElementById('rpBrowseSearch').addEventListener('keydown', e => e.key === 'Enter' && doRpSearch(false));
  document.getElementById('rpLoadMoreBtn').addEventListener('click', () => { rpBrowseOffset += 20; doRpSearch(true); });
  document.getElementById('spBrowseSearchBtn').addEventListener('click', () => doSpSearch(false));
  document.getElementById('spBrowseSearch').addEventListener('keydown', e => e.key === 'Enter' && doSpSearch(false));
  document.getElementById('spLoadMoreBtn').addEventListener('click', () => { spBrowseOffset += 20; doSpSearch(true); });

  // Populate version dropdowns from loaded versions list
  ['rpBrowseVersion', 'spBrowseVersion'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel || !versions?.length) return;
    versions.filter(v => v.type === 'release').slice(0, 20).forEach(v =>
      sel.appendChild(new Option(v.id, v.id)));
  });
}

function renderAssetCards(hits, containerId, installing, onInstall) {
  const container = document.getElementById(containerId);
  if (!hits.length) {
    if (!container.children.length)
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px">No results found.</div>';
    return;
  }
  hits.forEach((hit, i) => {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.style.animationDelay = `${i * 0.03}s`;
    const dl = hit.downloads > 1000000
      ? `${(hit.downloads/1000000).toFixed(1)}M`
      : hit.downloads > 1000 ? `${(hit.downloads/1000).toFixed(0)}k` : hit.downloads;
    card.innerHTML = `
      <div class="asset-card-title">${escapeHtml(hit.title)}</div>
      <div class="asset-card-desc">${escapeHtml(hit.description || '')}</div>
      <div class="asset-card-meta">
        ${(hit.categories || []).slice(0, 3).map(c => `<span class="wc-badge">${escapeHtml(c)}</span>`).join('')}
      </div>
      <div class="asset-card-footer">
        <span class="asset-downloads">⬇ ${dl}</span>
        <button class="asset-install-btn">Install</button>
      </div>`;
    card.querySelector('.asset-install-btn').addEventListener('click', e => {
      if (e.target.classList.contains('installed') || e.target.disabled) return;
      onInstall(hit.project_id, hit.title, e.target);
    });
    container.appendChild(card);
  });
}

function refreshAssetProfiles() {
  ['rpProfileSelect', 'spProfileSelect', 'worldsProfileSelect',
   'rpBrowseInstallProfile', 'spBrowseInstallProfile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    const isInstall = id.includes('Browse');
    el.innerHTML = isInstall
      ? '<option value="">Install to profile…</option>'
      : '<option value="">Select profile…</option>';
    profiles.forEach(p => el.appendChild(new Option(p.name, p.id)));
    if (prev && profiles.find(pr => pr.id === prev)) el.value = prev;
    else if (activeProfileId) el.value = activeProfileId;
  });
  // Auto-load worlds for the selected profile
  const wSel = document.getElementById('worldsProfileSelect');
  if (wSel.value) {
    const p = profiles.find(pr => pr.id === wSel.value);
    currentWorldsGameDir = (p && p.gameDir) ? p.gameDir : '';
    refreshWorlds();
  }
  // Auto-load resource/shader packs
  const rpSel = document.getElementById('rpProfileSelect');
  if (rpSel.value) {
    const p = profiles.find(pr => pr.id === rpSel.value);
    currentRpGameDir = (p && p.gameDir) ? p.gameDir : '';
    refreshResourcePacks();
  }
  const spSel = document.getElementById('spProfileSelect');
  if (spSel.value) {
    const p = profiles.find(pr => pr.id === spSel.value);
    currentSpGameDir = (p && p.gameDir) ? p.gameDir : '';
    refreshShaderPacks();
  }
}

async function refreshResourcePacks() {
  if (!currentRpGameDir) { showAssetState('rp', 'empty'); return; }
  const packs = await window.launcher.getResourcePacks({ gameDir: currentRpGameDir });
  if (!packs.length) { showAssetState('rp', 'none'); return; }
  showAssetState('rp', 'list');
  const body = document.getElementById('rpListBody');
  body.innerHTML = '';
  packs.forEach(p => {
    const row = document.createElement('div');
    row.className = 'assets-row';
    row.innerHTML = `
      <div class="assets-name">${escapeHtml(p.name)}</div>
      <div class="assets-size">${p.size ? formatBytes(p.size) : (p.isDir ? 'folder' : '—')}</div>
      <div><label class="toggle"><input type="checkbox" ${p.enabled ? 'checked' : ''}/><span class="toggle-slider"></span></label></div>
      <button class="mod-delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/>
          <path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/>
        </svg>
      </button>`;
    row.querySelector('input').addEventListener('change', async (e) => {
      await window.launcher.toggleResourcePack({ gameDir: currentRpGameDir, name: p.name, enabled: e.target.checked });
      toast(`${p.name} ${e.target.checked ? 'enabled' : 'disabled'}`, 'ok');
    });
    row.querySelector('.mod-delete').addEventListener('click', async () => {
      if (!confirm(`Delete ${p.name}?`)) return;
      await window.launcher.deleteResourcePack({ gameDir: currentRpGameDir, name: p.name });
      await refreshResourcePacks();
      toast('Deleted.', 'ok');
    });
    body.appendChild(row);
  });
}

async function refreshShaderPacks() {
  if (!currentSpGameDir) { showAssetState('sp', 'empty'); return; }
  const packs = await window.launcher.getShaderPacks({ gameDir: currentSpGameDir });
  if (!packs.length) { showAssetState('sp', 'none'); return; }
  showAssetState('sp', 'list');
  const body = document.getElementById('spListBody');
  body.innerHTML = '';
  packs.forEach(p => {
    const row = document.createElement('div');
    row.className = 'assets-row sp-row';
    row.innerHTML = `
      <div class="assets-name">${escapeHtml(p.name)}</div>
      <div class="assets-size">${p.size ? formatBytes(p.size) : (p.isDir ? 'folder' : '—')}</div>
      <button class="mod-delete" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/>
          <path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/>
        </svg>
      </button>`;
    row.querySelector('.mod-delete').addEventListener('click', async () => {
      if (!confirm(`Delete ${p.name}?`)) return;
      await window.launcher.deleteShaderPack({ gameDir: currentSpGameDir, name: p.name });
      await refreshShaderPacks();
      toast('Deleted.', 'ok');
    });
    body.appendChild(row);
  });
}

function showAssetState(prefix, state) {
  document.getElementById(`${prefix}Empty`).style.display = state === 'empty' ? '' : 'none';
  document.getElementById(`${prefix}None`).style.display  = state === 'none'  ? '' : 'none';
  document.getElementById(`${prefix}List`).style.display  = state === 'list'  ? '' : 'none';
}

// ── Mod conflict checker ───────────────────────────────────────────────────────
async function checkModConflicts() {
  if (!currentModProfile) return toast('Select a profile first.', 'err');
  const bar = document.getElementById('modConflictsBar');
  const txt = document.getElementById('modConflictsText');
  const lst = document.getElementById('modConflictsList');
  bar.style.display = '';
  lst.innerHTML = '';
  txt.textContent = 'Checking for conflicts…';
  const gd = getGameDirForModProfile();
  const r  = await window.launcher.checkModConflicts({ gameDir: gd });
  if (r.error) { txt.textContent = `Error: ${r.error}`; return; }
  if (!r.conflicts.length) {
    txt.textContent = `No conflicts found ✓  (${r.checked} mods checked, ${r.identified || 0} identified on Modrinth)`;
  } else {
    txt.textContent = `${r.conflicts.length} conflict${r.conflicts.length > 1 ? 's' : ''} detected:`;
    r.conflicts.forEach(c => {
      const div = document.createElement('div');
      div.className = 'conflict-item';
      div.innerHTML = `<span class="conflict-mod">${escapeHtml(c.mod1)}</span>
        <span class="conflict-sep">⚡</span>
        <span class="conflict-mod">${escapeHtml(c.mod2)}</span>
        <span class="conflict-reason">${escapeHtml(c.reason)}</span>`;
      lst.appendChild(div);
    });
  }
}