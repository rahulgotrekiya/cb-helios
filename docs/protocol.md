# Cosmic Byte Helios — Protocol Map (reverse-engineering)

**Status: in progress.** Confirmed findings + open questions, updated as we decode.
Companion to [`research.md`](research.md). Everything here was observed on the real
device via WebHID introspection.

---

## Device identity (confirmed)

- **VID `0xa8a4`, PID `0x2255`**
- HID product name: `USB MOUSE` (kernel `HID_NAME`: `YJX-CHIP USB MOUSE` — YJX-CHIP is
  the controller/OEM)
- Tested over **wired USB**. Enumerates as **3 HID interfaces** (`hidraw` nodes); the
  Chrome device chooser lists selectable interfaces separately.

## HID interfaces / collections (from WebHID)

### Interface A — composite input (remapped keys → OS)
| usagePage / usage | meaning | reports |
|---|---|---|
| `0x0001` / `0x0006` | Keyboard | (sizes not yet re-measured) |
| `0x000c` / `0x0001` | Consumer Control | input id 3 |
| `0x0001` / `0x0080` | System Control | — |
| `0xff05` / `0x0002` | vendor | input id 10 |
| `0xff06` / `0x0002` | vendor | input id 11, output id 11 |

Purpose: delivers remapped keyboard/media/system keys to the OS. The vendor
`0xff05`/`0xff06` collections may be secondary config; **report sizes here were
captured before the byte-sizing code was finished, so they read as 0 and need
re-measuring.**

### Interface B — config command channel ✅ (primary target)
| usagePage / usage | reports |
|---|---|
| `0xff01` / `0x0010` | **input id 0 = 64 bytes**, **output id 0 = 64 bytes** |

**This is the command pipe.** Send a 64-byte **output** report, the device replies
with a 64-byte **input** report. `reportId 0` = unnumbered, so all 64 bytes are
payload (no leading report-ID byte).

## The config channel (confirmed)

- Target interface: `usagePage 0xff01`, `usage 0x0010`.
- **Send:** output report, `reportId 0`, 64-byte payload — `device.sendReport(0, data)`.
- **Receive:** input report, `reportId 0`, 64-byte payload — via `device.oninputreport`.
- **App tip:** filter `requestDevice` to `{ vendorId: 0xa8a4, usagePage: 0xff01 }` so
  users land on the right interface automatically instead of guessing in the chooser.

## Open questions (milestone 2 targets)

- Byte layout inside the 64-byte packet: byte 0 = command id? length? checksum/CRC?
- Command opcodes for: **read firmware/info, set DPI stage, set polling, set RGB
  (effect/color/speed/brightness), remap button, read/write macro, lift-off/debounce,
  read/write profile**.
- Which interface Orbit actually drives for config (likely `0xff01`; confirm vs
  `0xff05`/`0xff06`).
- Re-measure `0xff05` / `0xff06` report sizes with the fixed code.
- A safe "read info" command to prove two-way comms **without risk of a bad write**.

## Method (safety first)

1. **Primary:** read the official **Orbit** JS bundle — it builds these exact 64-byte
   packets; copy the byte layout. Safe, no writes to the device.
2. **Secondary:** diff the live 64-byte input/output on our device while toggling one
   setting at a time in Orbit.
3. **Never** fire unknown opcodes at the device blindly — risk of bad writes / bricking.

## Findings log

- **2026-08-16** — Identified the config channel: interface `0xff01`/`0x0010`, paired
  64-byte input+output reports at `reportId 0`. Confirmed VID/PID `a8a4`/`2255`,
  controller YJX-CHIP. WebHID connect working on NixOS after a `GROUP="users"` udev
  rule (`uaccess` from `99-local.rules` was too late to apply).
