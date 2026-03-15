const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  // Window
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  killGame: () => ipcRenderer.send('kill-game'),

  // Versions & Loaders
  getVersions:       ()     => ipcRenderer.invoke('get-versions'),
  getLoaderVersions: (opts) => ipcRenderer.invoke('get-loader-versions', opts),

  // Settings
  getSettings:  ()  => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),

  // Profiles
  getProfiles:   ()     => ipcRenderer.invoke('get-profiles'),
  saveProfiles:  (p)    => ipcRenderer.invoke('save-profiles', p),
  createProfile: (opts) => ipcRenderer.invoke('create-profile', opts),
  deleteProfile: (opts) => ipcRenderer.invoke('delete-profile', opts),

  // Java
  getJavaStatus: ()     => ipcRenderer.invoke('get-java-status'),
  downloadJava:  (opts) => ipcRenderer.invoke('download-java', opts),

  // System
  getSystemRam: () => ipcRenderer.invoke('get-system-ram'),
  checkUpdate:  (opts) => ipcRenderer.invoke('check-update', opts),

  // Mods
  getModProfiles:  (opts) => ipcRenderer.invoke('get-mod-profiles', opts),
  getMods:         (opts) => ipcRenderer.invoke('get-mods', opts),
  addMod:          (opts) => ipcRenderer.invoke('add-mod', opts),
  deleteMod:       (opts) => ipcRenderer.invoke('delete-mod', opts),
  toggleMod:       (opts) => ipcRenderer.invoke('toggle-mod', opts),
  openModsFolder:  (opts) => ipcRenderer.invoke('open-mods-folder', opts),
  checkModUpdates: (opts) => ipcRenderer.invoke('check-mod-updates', opts),
  updateMod:       (opts) => ipcRenderer.invoke('update-mod', opts),

  // Loader install
  installLoader: (opts) => ipcRenderer.invoke('install-loader', opts),

  // Modrinth mods
  searchModrinth:     (opts) => ipcRenderer.invoke('search-modrinth', opts),
  installModrinthMod: (opts) => ipcRenderer.invoke('install-modrinth-mod', opts),

  // Modrinth modpacks
  searchModrinthModpacks:  (opts) => ipcRenderer.invoke('search-modrinth-modpacks', opts),
  installModrinthModpack:  (opts) => ipcRenderer.invoke('install-modrinth-modpack', opts),

  // Modpack export/import
  exportModpack: (opts) => ipcRenderer.invoke('export-modpack', opts),
  importModpack: (opts) => ipcRenderer.invoke('import-modpack', opts),

  // Screenshots
  getScreenshots:       (opts) => ipcRenderer.invoke('get-screenshots', opts),
  openScreenshot:       (opts) => ipcRenderer.invoke('open-screenshot', opts),
  openScreenshotsFolder:(opts) => ipcRenderer.invoke('open-screenshots-folder', opts),

  // Crash logs
  getCrashLogs:  (opts) => ipcRenderer.invoke('get-crash-logs', opts),
  readCrashLog:  (opts) => ipcRenderer.invoke('read-crash-log', opts),

  // Servers
  getServers:  ()        => ipcRenderer.invoke('get-servers'),
  saveServers: (servers) => ipcRenderer.invoke('save-servers', servers),
  pingServer:  (opts)    => ipcRenderer.invoke('ping-server', opts),

  // Dialogs
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  saveFileDialog: (opts) => ipcRenderer.invoke('save-file-dialog', opts),

  // Game
  launch: (opts) => ipcRenderer.invoke('launch-minecraft', opts),

  // Events → returns unsubscribe fn
  on: (channel, cb) => {
    const allowed = [
      'download-progress', 'launch-progress', 'launch-log',
      'game-closed', 'game-crashed', 'modrinth-install-progress',
    ];
    if (!allowed.includes(channel)) return () => {};
    const handler = (_, ...args) => cb(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});