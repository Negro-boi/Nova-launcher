# Nova Launcher

> A fast, feature-rich, offline Minecraft launcher built with Electron.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)](#)

---

## Features

### Core Launch

- Offline / cracked mode — no Mojang account required
- All Minecraft versions — releases, snapshots, old alpha and beta
- Loader support — Vanilla, Fabric, Forge, OptiFine
- Fabric and Forge auto-install before first launch
- Java auto-management — downloads the correct Adoptium/Eclipse Temurin JRE automatically (Java 8, 17, or 21 based on MC version)
- Stop game button — kill the running game process at any time

### Profiles

- Multiple profiles with fully separate game directories
- Per-profile settings — RAM, version, loader, resolution, fullscreen toggle, custom Java path
- Recently played quick-launch cards on the home screen
- Play count and last played time tracked per profile

### Mods

- Per-profile mod list — add, remove, enable and disable `.jar` files
- Drag and drop `.jar` files directly into the launcher window
- Mod update checker — compares your installed mods against Modrinth via SHA-512 hashes, one-click Update All
- Mod conflict detector — checks Modrinth dependency data for known incompatible mod pairs

### Browse (Modrinth)

- Search and install mods directly from Modrinth, filtered by MC version and loader
- Search and install modpacks from Modrinth
- Modpack import and export — save your mods and config as a `.zip` or load one from disk

### Worlds

- Lists all saves for the selected profile
- Reads `level.dat` via binary NBT parsing — shows world name, game mode, seed, and last played date
- Open world folder, backup world to `.zip`, delete world with confirmation

### Assets

- **Resource Packs** — list, install, enable/disable, and delete resource packs per profile; reads and writes `options.txt`
- **Shader Packs** — list, install, and delete shader packs per profile (works with OptiFine and Iris)

### Screenshots

- Per-profile screenshot grid
- Full-screen lightbox viewer with keyboard navigation (← → ESC)
- Open any screenshot in your system image viewer

### Servers

- Save and manage favourite servers
- Live Minecraft SLP ping — shows MOTD, online player count, server version
- Ping all servers at once

### Tools

- Crash log analyzer — reads the latest crash report on abnormal game exit, identifies common causes (out of memory, wrong Java version, mod conflicts) and shows a human-readable summary
- Auto-update checker — polls GitHub Releases API on startup and shows a banner if a newer version is available
- RAM auto-suggest — recommends 50% of system RAM, capped at 8 GB
- Real-time console with color-coded log levels

---

## Installation

Download the latest release from the [Releases](https://github.com/Negro-boi/Nova-Launcher/releases) page.

| Platform | File |
| -------- | ---- |
| Windows  | `Nova-Launcher-Setup-x.x.x.exe` |
| Linux    | `Nova-Launcher-x.x.x.AppImage` |
| macOS    | `Nova-Launcher-x.x.x.dmg` |

**Windows:** run the `.exe` installer and follow the setup wizard.

**Linux:** make the AppImage executable (`chmod +x Nova-Launcher-*.AppImage`) then run it.

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- [Git](https://git-scm.com)

### Steps

```bash
# Clone the repository
git clone https://github.com/Negro-boi/Nova-Launcher.git
cd Nova-Launcher

# Install dependencies
npm install

# Run in development mode
npm start

# Build a distributable
npm run build:win    # Windows .exe installer
npm run build:linux  # Linux .AppImage
npm run build:mac    # macOS .dmg
```

> Building for macOS requires a Mac. Windows builds can be cross-compiled on any platform.

---

## Project Structure

```text
Nova-Launcher/
├── main.js          ← Electron main process — IPC handlers, game launch, Java management,
│                      server ping, crash analysis, worlds, resource packs, shader packs
├── preload.js       ← Context bridge — exposes safe API to the renderer
├── package.json
├── assets/
│   └── icon.png
└── renderer/
    ├── index.html   ← UI layout — 11 tabs
    ├── app.js       ← Frontend logic
    └── style.css    ← Dark green theme (Oxanium + JetBrains Mono)
```

---

## Tabs

| Tab | Description |
| --- | ----------- |
| Home | Profile selector, loader picker, version picker, Play/Stop, recently played, console output |
| Profiles | Create, edit, duplicate, delete and quick-launch profiles |
| Versions | Browse all Minecraft versions with release/snapshot/old filter and search |
| Java | Adoptium JRE status, download and version info |
| Mods | Per-profile mod list, update checker, conflict detector, drag and drop |
| Browse | Modrinth mod and modpack browser, modpack import/export |
| Screenshots | Per-profile screenshot grid with lightbox |
| Servers | Saved server list with live SLP ping |
| Worlds | World cards with NBT metadata, backup, delete |
| Assets | Resource pack and shader pack manager per profile |
| Settings | Username, RAM, resolution, Java path, update repo |

---

## Data Locations

All launcher data is stored under `~/.nova-launcher/`:

| Path | Contents |
| ---- | -------- |
| `settings.json`        | Global settings |
| `profiles.json`        | Profile definitions |
| `servers.json`         | Saved server list |
| `minecraft/`           | Default game directory |
| `instances/<id>/`      | Per-profile game directories |
| `java/`                | Adoptium JRE downloads |
| `world-backups/`       | World ZIP backups |

---

## Tech Stack

| Technology | Purpose |
| ---------- | ------- |
| [Electron 28](https://electronjs.org) | Desktop app shell |
| [minecraft-launcher-core](https://github.com/Pierce01/MinecraftLauncher-core) | Game launch engine |
| [Adoptium / Eclipse Temurin](https://adoptium.net) | Auto-managed JRE |
| [Modrinth API v2](https://docs.modrinth.com) | Mod, modpack, and update data |
| Node.js `net` module | Minecraft SLP server ping |
| Node.js `zlib` | Binary NBT level.dat parsing |
| [archiver](https://www.npmjs.com/package/archiver) | World and modpack ZIP exports |

---

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Disclaimer

Nova Launcher is an unofficial third-party launcher and is not affiliated with or endorsed by Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios. Use of offline/cracked mode may violate Minecraft's Terms of Service.