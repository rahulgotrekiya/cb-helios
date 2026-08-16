# cb-helios

An open-source, browser-based configurator for the **Cosmic Byte Helios** tri-mode
wireless gaming mouse — built with WebHID. A custom alternative to the official Orbit
app, with deeper RGB/effect control, an advanced macro engine, and profile
import/export.

> ⚠️ Early WIP. Not affiliated with Cosmic Byte. For hardware you own.

## Features

- **RGB effect** — pick any of the 7 firmware presets. (The firmware has no custom
  colour/brightness — [proven](docs/protocol.md), not a limitation of this app.)
- **DPI** — six fully editable stage values (100–10,000), plus the active stage.
- **Polling rate** — 125 / 250 / 500 / 1000 Hz.
- **Scroll direction** — normal / reversed.
- **Profiles** — export the current config to JSON and import it back.
- **Developer tools** — a raw 64-byte packet sender + reply viewer for further
  reverse-engineering.

Decoded but **not yet implemented** (need more reverse-engineering): button
remapping and macros — see [`docs/protocol.md`](docs/protocol.md).

See [`docs/research.md`](docs/research.md) for background and
[`docs/protocol.md`](docs/protocol.md) for the byte-level protocol map.

## Requirements

- A Cosmic Byte Helios mouse (wired or 2.4GHz dongle)
- A WebHID-capable desktop browser: **Chrome, Edge, Brave, Opera, or Vivaldi**
  (Firefox and Safari are not supported)

## Development

```bash
npm install
npm run dev
```

Then open the local URL in a supported browser and click **Connect**.

## License

[MIT](LICENSE) © Rahul Gotrekiya
