/**
 * Protocol encoder for the Cosmic Byte Helios config channel.
 * All packets are 64 bytes, sent on reportId 0 over the 0xff01 interface.
 * Byte maps are documented in docs/protocol.md.
 */

const PACKET_SIZE = 64;

/** RGB effects, indexed by the effect id the firmware expects (byte 10). */
export const LIGHT_EFFECTS = [
  "Wave", // 0
  "Neon", // 1
  "Touring Flash", // 2
  "Yo-yo Ball", // 3
  "Unidirectional Flashing", // 4
  "Circular Breathing", // 5
  "Off", // 6
] as const;

/**
 * Build the "set RGB effect" packet (command 0x21).
 * Layout (docs/protocol.md): 55 21 00 00 03 …zeros… [effectId@10] …zeros…
 * Byte 4 = 0x03 fixed (probed: it, and all other bytes, are ignored by the
 * firmware — only the effect id has any effect).
 */
export function buildLightEffect(effectId: number): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(PACKET_SIZE);
  p[0] = 0x55; // magic / start byte
  p[1] = 0x21; // command: set lighting
  p[4] = 0x03; // fixed, as Orbit sends
  p[10] = effectId; // 0..6, see LIGHT_EFFECTS
  return p;
}

/** Send the selected RGB effect over the config channel. */
export async function setLightEffect(device: HIDDevice, effectId: number): Promise<void> {
  await device.sendReport(0, buildLightEffect(effectId));
}

/**
 * Send an arbitrary packet (padded/truncated to 64 bytes) on the config channel.
 * This is the probe tool for experimenting with commands Orbit doesn't expose —
 * e.g. hunting for where custom RGB colour bytes go.
 */
export async function sendRaw(device: HIDDevice, bytes: ArrayLike<number>): Promise<void> {
  const p = new Uint8Array(PACKET_SIZE);
  p.set(Array.from(bytes).slice(0, PACKET_SIZE));
  await device.sendReport(0, p);
}

/**
 * TODO(human): parse a hex string like "55 21 00 0a ff" into [0x55,0x21,0x00,0x0a,0xff].
 * - Split on whitespace and/or commas; ignore empty tokens.
 * - parseInt(token, 16) for each token.
 * - throw new Error(`bad byte: "${token}"`) if the result is NaN or > 255, so the
 *   UI can show a clear message instead of sending garbage.
 */
export function parseHexBytes(text: string): number[] {
  return text
  .split(/[\s,]+/)
  .filter((t) => t.length)
  .map((t) => {
    const n = parseInt(t, 16);
    if (Number.isNaN(n) || n > 255) throw new Error(`bad byte: "${t}"`);
    return n;
  });
}

// ---- Mouse settings: DPI stages, active stage, polling, scroll (command 0x0f) ----

/** Polling rates, mapping the firmware code (byte 10) to Hz. */
export const POLLING_RATES = [
  { hz: 125, code: 1 },
  { hz: 250, code: 2 },
  { hz: 500, code: 3 },
  { hz: 1000, code: 4 },
] as const;

export interface Settings {
  dpi: number[]; // 6 stage values, e.g. [800, 1600, ...]
  activeStage: number; // 1..6 — which stage is current
  pollingCode: number; // 1..4 — see POLLING_RATES
  scrollReversed: boolean; // byte 48
}

/** Factory defaults, captured from the device. */
export const DEFAULT_SETTINGS: Settings = {
  dpi: [800, 1600, 2400, 3200, 6400, 10000],
  activeStage: 6,
  pollingCode: 4,
  scrollReversed: false,
};

/**
 * Build the mouse-settings packet (command 0x0f). Header/trailer are the fixed
 * bytes captured from Orbit (no checksum, so replaying them is safe); we only
 * fill the fields we control. See docs/protocol.md.
 *
 * NOTE: byte 10 (polling) vs byte 12 (active stage) is our best read of the
 * captures — verify on-device and swap if reversed.
 */
export function buildSettings(s: Settings): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(PACKET_SIZE);
  p.set([0x55, 0x0f, 0xae, 0x0a, 0x2f, 0x01, 0x01, 0x01, 0x00, 0x01], 0); // fixed header
  p[10] = s.pollingCode; // 1..4
  p[11] = 0x06; // stage count (6)
  p[12] = s.activeStage; // 1..6
  for (let i = 0; i < 6; i++) {
    const dpi = s.dpi[i] ?? 0;
    p[13 + i * 2] = dpi & 0xff; // low byte (little-endian)
    p[14 + i * 2] = (dpi >> 8) & 0xff; // high byte
  }
  p[48] = s.scrollReversed ? 1 : 0;
  p.set([0xff, 0x01, 0x0a, 0xff, 0xff], 49); // fixed trailer
  return p;
}

/** Write DPI / polling / active-stage / scroll to the mouse in one packet. */
export async function applySettings(device: HIDDevice, s: Settings): Promise<void> {
  await device.sendReport(0, buildSettings(s));
}

// Dev-only self-checks: encoders/parsers must match known-good values. These fire
// a console.assert in the browser dev console if the logic ever drifts.
if ((import.meta as any).env?.DEV) {
  const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const expected = "55 21 00 00 03 00 00 00 00 00 03" + " 00".repeat(53);
  console.assert(hex(buildLightEffect(3)) === expected, "helios: buildLightEffect mismatch");
  console.assert(
    JSON.stringify(parseHexBytes("55 21 0a ff")) === JSON.stringify([0x55, 0x21, 0x0a, 0xff]),
    "helios: parseHexBytes not implemented yet (see TODO)",
  );
  const capSettings =
    "55 0f ae 0a 2f 01 01 01 00 01 04 06 06 20 03 40 06 60 09 80 0c 00 19 10 27" +
    " 00".repeat(24) +
    " ff 01 0a ff ff" +
    " 00".repeat(10);
  console.assert(hex(buildSettings(DEFAULT_SETTINGS)) === capSettings, "helios: buildSettings mismatch");
}
