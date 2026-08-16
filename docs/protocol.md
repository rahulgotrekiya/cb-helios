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

## Decoded: packet framing

- Every packet is 64 bytes on `reportId 0`. **Byte 0 = `0x55`** (magic/start), all packets.
- **Byte 1 = command id.** Seen so far: `0x0f` = write DPI config; `0x0e` = a
  read/status request (constant `55 0e 01 0b 30 00…`) Orbit sends right before each write.
- **Checksum: not yet determined.** Across DPI *active-stage* changes, byte 2 (`0xae`)
  stayed constant even though byte 10 changed — so either there's no checksum, or it
  doesn't cover that byte. Confirm by capturing a change to a DPI *value* (below).

## Decoded: DPI configuration — command `0x0f`

Captured template (64 bytes, `reportId 0`):
```
55 0f ae 0a 2f 01 01 01 00 01 [AS] [NS] 02 <6× DPI LE16> 00…00 ff 01 0a ff ff 00…
```
| offset | field | notes |
|---|---|---|
| 0 | `0x55` | magic |
| 1 | `0x0f` | command = write DPI config |
| 2–9 | `ae 0a 2f 01 01 01 00 01` | fixed header (checksum/length? TBD) |
| **10** | **[AS] active DPI stage** | 1-based; observed 1–4 |
| **11** | **[NS] stage count** | `0x06` = 6 stages |
| 12 | `0x02` | unknown (per-stage flag?) |
| **13–24** | **6 × DPI, little-endian uint16** | `800,1600,2400,3200,6400,10000` |
| 49–53 | `ff 01 0a ff ff` | unknown trailer (lift-off? terminator?) |

**Actionable now:** set the active DPI stage by replaying this exact template with
byte 10 changed — no checksum math needed since the rest is byte-identical to a
known-good Orbit packet.

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
- **2026-08-16** — Decoded DPI command `0x0f` by sniffing `HIDDevice.sendReport` in
  Orbit's tab. DPI stages are 6× little-endian uint16 (800/1600/2400/3200/6400/10000);
  byte 10 = active stage, byte 11 = stage count. Packet framing: 64B, byte 0 `0x55`,
  byte 1 = command id (`0x0f` write DPI, `0x0e` read/status). Checksum still unknown.
