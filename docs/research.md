# Cosmic Byte Helios — Research (pre-build)

Research gathered before building a custom browser configurator for the Cosmic Byte
Helios tri-mode wireless mouse. Goal: match the official **Orbit** app, then exceed it
with custom RGB/effects, an advanced macro engine, and profile import/export + tuning.

_Last updated: 2026-08-16._

---

## 1. The device: Cosmic Byte Helios (Tri-Mode)

| Component | Detail | Source |
|---|---|---|
| Sensor | **FR2012 + S203** gaming sensor; 800–10,000 DPI; 60 IPS; 20G accel | manual highlights, product listings |
| Switches | **Huano**, rated 10M clicks | manual |
| Buttons | **5 programmable** buttons | manual |
| Lighting | RGB, **6 built-in effects** (customizable or off via software) | product listing |
| Feet | PTFE | manual |
| Weight | 81 g (no cable) | manual |
| Connectivity | **Tri-mode**: Wired USB-C, 2.4GHz dongle, Bluetooth | product listing |
| Polling | up to **1000 Hz** wired/2.4G; Bluetooth capped ~125 Hz | Orbit docs |
| MCU / battery capacity | **Not published — determine by teardown or protocol probing** | — |

### How the pieces work together
- **Sensor (FR2012+S203):** reports motion counts. DPI is the sensor's
  counts-per-inch setting, changed by a config command and typically stored as DPI
  *stages* the user cycles through with a button.
- **Polling rate:** how often the USB/2.4G endpoint is read (125/250/500/1000 Hz).
  Set via a config command; Bluetooth is limited by the BT HID spec (~125 Hz).
- **Switches:** raise button events. **Remapping and macros live in the mouse's
  firmware** — the config app writes a button→action table to onboard memory, so
  binds persist without any software running in the background.
- **RGB:** driven by the MCU. Effects (breathing, wave, etc.), speed, brightness, and
  color are parameters written over HID.
- **Tri-mode:** wired and 2.4G expose a **vendor-defined HID interface** (the config
  channel), separate from the standard HID mouse pointer. Config always targets the
  vendor interface.
- **Onboard profiles:** settings persist in the mouse. The app's job is to read/write
  that onboard state, not to run resident.

---

## 2. The official app — Orbit (what we match, then exceed)

- **URL:** `https://orbit.thecosmicbyte.com/cosmicbyte-configurator.html?model=helios`
- WebHID-based, no install. Requires Chrome/Edge/Opera/Brave/Vivaldi on desktop.
- USB vendor IDs referenced: **`a8a4`** and **`a8a5`** (confirm which is wired vs.
  dongle during reverse-engineering; also capture the product IDs).
- **Feature set:** DPI stages + on-the-fly switch (up to 10,000 DPI), polling
  (125/250/500/1000 Hz), debounce, lift-off distance, button/key remap, macros with
  real timing + loop modes, RGB effects/skins, scroll-direction, guided firmware
  update (device firmware seen: v2.0.3), save profiles to device.

Orbit is Cosmic Byte's move away from per-product desktop apps toward one browser
portal for all their peripherals.

---

## 3. The technology: WebHID

- **What:** browser API to talk to HID devices from JavaScript via
  feature/input/output reports.
- **Support:** Chrome/Edge 89+, Opera 76+, Brave, Vivaldi. **Not** Firefox, **not**
  Safari, **not** mobile.
- **Key gotcha:** Chrome **blocks generic mouse/keyboard top-level usages** for
  security. The Helios is reachable only because it also exposes a **vendor-defined
  usage page** (`0xFF00`+). We filter on VID `a8a4`/`a8a5` and select the vendor
  collection — the same channel Orbit uses.
- **Core calls:**
  - `navigator.hid.requestDevice({ filters })` — must be triggered by a user gesture.
  - `device.open()`
  - `device.sendFeatureReport(reportId, data)` / `device.receiveFeatureReport(id)`
  - `device.oninputreport` — live events (e.g. current DPI stage, battery).
  - Page must be served over HTTPS or `localhost`.

---

## 4. Reverse-engineering the protocol (no public spec exists)

There is no published byte-level spec, so we derive it. Order of attack, cheapest
first — we have the physical mouse + dongle, which makes this straightforward:

1. **Read Orbit's own JS bundle.** It's WebHID JavaScript served to the browser — the
   report IDs and command byte layouts for DPI/polling/RGB/remap/macros/firmware are
   all in there. Open the configurator in Chrome, grab the loaded `.js` from the
   Network tab / DevTools Sources, and read the report-building functions. Highest
   value step; usually yields the whole protocol.
2. **Live capture on the real device.** `chrome://device-log`, plus a small WebHID
   scratch page that dumps every feature report before/after changing one setting in
   Orbit → diff the bytes to map each field.
3. **USB-level fallback (if needed).** USBPcap + Wireshark (Windows) or usbmon
   (Linux); `node-hid`; USB Device Tree Viewer for the raw HID descriptor.

**Output of this phase:** `docs/protocol.md` — a table of report ID + byte offsets per
command: set DPI stage, set polling, set RGB (effect/color/speed/brightness), remap
button, write macro, lift-off/debounce, read/write profile, firmware.

---

## 5. Reuse / prior art

- **OpenMouse** — `github.com/OpenMouse-Project/openmouse` (Vite + TS + WebHID). Good
  **architectural reference** for a WebHID configurator, but **not licensed for reuse**
  and has **no Cosmic Byte support**. Use as a mental model only; do not copy code.
- **awesome-webhid** — `github.com/robatwilliams/awesome-webhid`. Reference
  implementations for feature-report patterns: `@elgato-stream-deck/webhid`,
  `tomayac/joy-con-webhid`, `TheBITLINK/WebHID-DS4`.
- **mouse.xyz** — web driver for G-Wolves mice; another example of a single-vendor
  WebHID configurator.

---

## 6. Constraints / risks

- **Firmware and profile writes are irreversible if malformed.** Never guess a
  firmware command; only touch firmware after the protocol is confirmed byte-exact.
- **Bluetooth mode** likely exposes a reduced config surface vs. wired/2.4G.
- **Protocol may vary by firmware version** — record the version we test against
  (Orbit currently shows Helios firmware v2.0.3).

---

## 7. Legal / ethical note

This is a personal interoperability tool for hardware the user owns. Reverse-engineering
your own device's protocol for interoperability is standard practice. Do not
redistribute Cosmic Byte's proprietary assets or firmware, and ship without bundling any
Orbit code.

---

## 8. Decided approach (for the build)

- **Stack:** Vanilla TypeScript + Vite, WebHID directly, no UI framework. A tiny
  renderer (`lit-html`) only if a single panel (macros/RGB) gets unwieldy.
- **Extra features prioritized:** custom RGB/effects, advanced macros, import/export +
  fine tuning (lift-off, debounce, angle snapping, sensor calibration).
- **Deferred:** firmware update (high risk), per-app auto-profiles (needs a native
  companion), any backend/login.

## Open items to resolve during build
- Which VID is wired vs. dongle; the product IDs.
- Whether firmware supports custom per-LED RGB frames (drives how deep the RGB editor
  can go).
- Number of onboard macro/profile slots.

---

## Sources
- [Cosmic Byte Helios product page](https://www.thecosmicbyte.com/product/cosmic-byte-helios-tri-mode-mouse-with-software-support-1000hz-polling-rate/)
- [Amazon listing (specs)](https://www.amazon.in/Cosmic-Byte-Helios-Programmable-Lightweight/dp/B0GYRT8L3R)
- [Helios user manual (PDF)](https://cdns3.thecosmicbyte.com/wp-content/uploads/Cosmic-Byte-Helios-User-Manual-1.pdf)
- [Orbit configurator (Helios)](https://orbit.thecosmicbyte.com/cosmicbyte-configurator.html?model=helios)
- [Orbit portal](https://orbit.thecosmicbyte.com/)
- [OpenMouse project](https://github.com/OpenMouse-Project/openmouse)
- [awesome-webhid](https://github.com/robatwilliams/awesome-webhid)
- [WebHID API spec](https://wicg.github.io/webhid/)
