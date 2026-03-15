# Nova Launcher

> A fast, feature-rich, offline Minecraft launcher built with Electron.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)](https://nodejs.org)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

[Download](#installation) · [Features](#features) · [Build from Source](#building-from-source)

---

## Features

### Core

- **Offline / Cracked mode** — play without a Mojang account
- **All Minecraft versions** — releases, snapshots, old alpha/beta
- **Loader support** — Vanilla, Fabric, Forge, OptiFine
- **Auto loader install** — Fabric & Forge install automatically before launch
- **Java auto-management** — downloads the correct Adoptium/Eclipse Temurin JRE automatically (Java 8 / 17 / 21 based on MC version)
- **Stop game** — kill the game process at any time from the launcher

### Profiles

- **Multiple profiles** — separate game directories per profile (Survival, Modded 1.20.1, etc.)
- **Per-profile settings** — RAM, version, loader, resolution, fullscreen, custom Java path
- **Recently played** — quick-launch cards on the home screen sorted by last played
- **Play stats** — tracks play count and last played time per profile
- **Profile duplication / deletion** — with optional file cleanup

### Mods

- **Mod manager** — add, remove, enable/disable mods per profile
- **Drag and drop** — drop `.jar` files directly into the launcher
- **Mod update checker** — compares installed mods against Modrinth using SHA-512 hashes, one-click "Update All"
- **Modrinth mod browser** — search and install mods directly, filtered by MC version and loader
- **Modpack browser** — search and install `.mrpack` modpacks from Modrinth
- **Modpack import/export** — export your mods + config as a `.zip`, or import from disk

### Screenshots

- **Per-profile screenshot viewer** — grid view of all in-game screenshots
- **Lightbox** — full-screen viewer with prev/next navigation and keyboard support (← → ESC)
- **Open in system viewer** — one-click to open in your OS image viewer

### Servers

- **Server list** — save favourite servers with name and address
- **Live ping** — Minecraft SLP protocol shows MOTD, player count, version, and online status
- **Ping All** — ping all servers at once

### Tools

- **Crash log analyzer** — auto-detects crash reports on game exit, shows a human-readable summary
- **Auto-update checker** — pings GitHub Releases API and shows a banner if a new version is available
- **RAM auto-suggest** — recommends optimal RAM based on your system (50% of total, capped at 8 GB)
- **Console** — real-time game output with color-coded log levels

---

## Installation

Download the latest release for your platform from the [Releases](https://github.com/Negro-boi/Nova-Launcher/releases) page.

| Platform | File                              |
| -------- | --------------------------------- |
| Windows  | `Nova-Launcher-Setup-x.x.x.exe`   |
| Linux    | `Nova-Launcher-x.x.x.AppImage`    |
| macOS    | `Nova-Launcher-x.x.x.dmg`         |

**Windows steps:**

1. Download the `.exe` installer
2. Run it and follow the setup wizard
3. Launch **Nova Launcher** from the Start Menu or Desktop

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org) 18 or newer
- [Git](https://git-scm.com)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/Negro-boi/Nova-Launcher.git
cd Nova-Launcher

# 2. Install dependencies
npm install

# 3. Run in development
npm start

# 4. Build a distributable
npm run build:win    # Windows (.exe)
npm run build:linux  # Linux (.AppImage)
npm run build:mac    # macOS (.dmg)
```

> **Note:** Building for macOS requires a Mac. Windows builds can be produced on any platform.

---

## Project Structure

```text
Nova-Launcher/
├── main.js          ← Electron main process (IPC, launch, Java, servers, crash analysis)
├── preload.js       ← Context bridge (exposes API to renderer)
├── package.json
├── assets/
│   └── icon.png
└── renderer/
    ├── index.html   ← UI layout (9 tabs)
    ├── app.js       ← Frontend logic
    └── style.css    ← Dark green theme
```

---

## Configuration

All data is stored in `~/.nova-launcher/`:

| Path               | Contents                                          |
| ------------------ | ------------------------------------------------- |
| `settings.json`    | Global settings (username, RAM, Java path, etc.)  |
| `profiles.json`    | All profile definitions                           |
| `servers.json`     | Saved server list                                 |
| `minecraft/`       | Default game files                                |
| `instances/<id>/`  | Per-profile game files                            |
| `java/`            | Bundled Adoptium JRE                              |

---

## Tech Stack

| Technology                                                                                                    | Purpose                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [Electron 28](https://electronjs.org)                                                                         | Desktop app framework     |
| [minecraft-launcher-core](https://github.com/Pierce01/MinecraftLauncher-core)                                 | Game launch engine        |
| [Adoptium / Eclipse Temurin](https://adoptium.net)                                                            | Auto-managed JRE          |
| [Modrinth API](https://docs.modrinth.com)                                                                     | Mod and modpack browser   |
| [Oxanium](https://fonts.google.com/specimen/Oxanium) + [JetBrains Mono](https://www.jetbrains.com/lp/mono/)   | Fonts                     |
| Node.js `net` module                                                                                          | Minecraft SLP server ping |

---

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repo
2. Create your branch: `git checkout -b feature/AmazingFeature`
3. Commit your changes: `git commit -m 'Add AmazingFeature'`
4. Push to the branch: `git push origin feature/AmazingFeature`
5. Open a Pull Request

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Disclaimer

Nova Launcher is an **unofficial** Minecraft launcher. It is not affiliated with or endorsed by Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios. Use of offline/cracked mode may violate Minecraft's Terms of Service — use responsibly.
