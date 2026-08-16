# Cosmic Byte Helios — Protocol Map (reverse-engineering)

**Status: in progress.** Confirmed findings + open questions, updated as we decode.
Companion to [`research.md`](research.md). Everything here was observed on the real
device via WebHID introspection and by sniffing `HIDDevice.sendReport` in Orbit's tab.

---

## Device identity (confirmed)

- **VID `0xa8a4`, PID `0x2255`**
- HID product name: `USB MOUSE` (kernel `HID_NAME`: `YJX-CHIP USB MOUSE` — YJX-CHIP is
  the controller/OEM)
- Tested over **wired USB**. Enumerates as **3 HID interfaces**.

## Config command channel ✅

- Target interface: `usagePage 0xff01`, `usage 0x0010`.
- **Send:** output report, `reportId 0`, 64-byte payload — `device.sendReport(0, data)`.
- **Receive:** input report, `reportId 0`, 64-byte payload — via `device.oninputreport`.
- App tip: filter `requestDevice` to `{ vendorId: 0xa8a4, usagePage: 0xff01 }`.

---

## Packet framing

- Every packet is 64 bytes on `reportId 0`. **Byte 0 = `0x55`** (magic/start), always.
- **Byte 1 = command id.** Pattern: **even = read/status, odd = write.** Each write is
  preceded by its matching read.
  | read | write | purpose |
  |---|---|---|
  | `0x0e` | `0x0f` | mouse settings (DPI table, active stage, polling, scroll dir) |
  | `0x08` | `0x09` | button / key mapping |
  | — | `0x21` | RGB lighting effect |
- **Bytes 2–4 = a fixed per-command header** (`0f`→`ae 0a 2f`, `09`→`a5 22 2c`,
  `08`→`01 0b 2c`, `0e`→`01 0b 30`). Constant for a command regardless of payload.
- **No payload checksum.** Proven: changing payload bytes (button slot `20 02`→`20 08`,
  scroll `00`→`01`, stage/polling indices) never changed byte 2. **We can build packets
  by editing payload bytes directly — no checksum to recompute.**

---

## Decoded: mouse settings — write `0x0f` (read `0x0e`)

```
55 0f ae 0a 2f 01 01 01 00 01 [PR] 06 [AS] <6× DPI LE16> 00…00 [SD] ff 01 0a ff ff 00…
```
| offset | field | notes |
|---|---|---|
| 0–9 | `55 0f ae 0a 2f 01 01 01 00 01` | fixed header |
| **10** | **[PR] polling rate** | 1–4 → likely 125/250/500/1000 Hz *(confirm)* |
| 11 | `0x06` | DPI stage count (6) |
| **12** | **[AS] active DPI stage** | 1–6 *(confirm — see note)* |
| **13–24** | **6 × DPI, little-endian uint16** | default `800,1600,2400,3200,6400,10000` |
| **48** | **[SD] scroll direction** | `0` = normal, `1` = reversed |
| 49–53 | `ff 01 0a ff ff` | fixed trailer |

> **Disambiguation TODO:** bytes 10 (seen 1–4) and 12 (seen 1–6) are two indices.
> Byte 12's 1–6 range = the 6 DPI stages → active stage. Byte 10's 1–4 range fits the
> 4 polling options. Confirm by changing ONLY one control at a time in Orbit.

## Decoded: RGB effect — write `0x21`

```
55 21 00 00 03 00…00 [FX] 00…
```
| offset | field | notes |
|---|---|---|
| 1 | `0x21` | command = set lighting |
| 4 | `0x03` | constant — likely a fixed brightness/speed Orbit doesn't expose |
| **10** | **[FX] effect id** | `0`=wave, `1`=neon, `2`=touring flash, `3`=yoyo ball, `4`=unidirectional flashing, `5`=circular breathing, `6`=off |

Orbit sends **no color and no brightness** — only the effect id. Whether the firmware
honors custom color/brightness in the spare/zero bytes (incl. byte 4) is an **open
probe** — see "Custom RGB" in open questions. This is the key lever for the
"more customization than Orbit" goal.

## Decoded: button / key mapping — write `0x09` (read `0x08`)

```
55 09 a5 22 2c 00 00 00 <8× 4-byte action entries starting at offset 8>
```
Each physical button = one 4-byte entry: `[TYPE] [CODE] [MOD] 00`.
- `TYPE 0x20` = **mouse button**, `CODE` = bitmask: `01`=L, `02`=R, `04`=M, `08`=back, `10`=forward.
- `TYPE 0x21` = **keyboard key**, `CODE` = HID keycode, `MOD` = modifier byte.

Observed default table:
```
slot0  20 01 00 00   left click
slot1  20 02 00 00   right click
slot2  20 04 00 00   middle click
slot3  20 08 00 00   back      (remap capture changed this 20 02 → 20 08)
slot4  20 10 00 00   forward
slot5  21 55 00 00   keyboard key 0x55
slot6  21 38 01 00   keyboard key 0x38 + modifier 0x01
```
To remap a button: overwrite its slot's 4 bytes with the desired `TYPE/CODE/MOD`.

---

## Open questions (next targets)

- **Confirm byte 10 = polling, byte 12 = active DPI stage** (isolated captures).
- **Custom RGB (the big one):** does the firmware honor color + brightness bytes the
  `0x21` packet doesn't currently use? Orbit exposes neither. Probe by sending `0x21`
  with candidate color/brightness bytes and watching the LEDs. Also test whether byte 4
  (`0x03`) is a brightness/speed level we can vary. If the firmware only supports the 7
  fixed presets, custom color can't be faked in software.
- Map each **physical button** to its slot index (which slot is the back button, etc.).
- Full **keyboard TYPE `0x21`** codes + modifier semantics (for key remaps & macros).
- **Macro** command (not yet captured).
- **Lift-off distance / debounce** commands (not yet captured).
- Meaning of the `ff 01 0a ff ff` trailer and the fixed per-command header bytes.

## Method (safety first)

1. Sniff Orbit via `HIDDevice.sendReport` wrapper (safe — Orbit does the writing).
2. Change ONE setting at a time; diff packets.
3. For features Orbit lacks (custom color/brightness), probe **from our app** with
   careful single writes and observe. RGB writes are low-risk; never guess firmware
   commands.

## Findings log

- **2026-08-16** — WebHID connect working on NixOS (udev `GROUP="users"` rule; `uaccess`
  from `99-local.rules` too late). Config channel = `0xff01`, 64B in/out at `reportId 0`.
- **2026-08-16** — Sniffed Orbit; decoded **DPI table** (6× LE16), **scroll direction**
  (byte 48), **RGB effect** (cmd `0x21`, byte 10 = effect 0–6), **button map** (cmd
  `0x09`, 4-byte entries; `0x20` mouse / `0x21` key). **Confirmed no payload checksum** —
  byte 2 is a fixed per-command header. Opcode pattern: even=read, odd=write.
  Orbit exposes no RGB color/brightness → candidate for our custom features.
