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
 * Layout (see docs/protocol.md): 55 21 00 00 03 …zeros… [effectId@10] …zeros…
 */
export function buildLightEffect(effectId: number): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(PACKET_SIZE);
  p[0] = 0x55; // magic / start byte
  p[1] = 0x21; // command: set lighting
  p[4] = 0x03; // fixed level Orbit always sends (brightness/speed? — to probe later)
  p[10] = effectId; // 0..6, see LIGHT_EFFECTS
  return p;
}

/** Send the selected RGB effect to the mouse over the config channel. */
export async function setLightEffect(device: HIDDevice, effectId: number): Promise<void> {
  await device.sendReport(0, buildLightEffect(effectId));
}

// Dev-only self-check: the encoder must reproduce a byte-exact packet captured
// from Orbit (effect id 3 = Yo-yo Ball). If this ever fails, the encoder drifted
// from the real protocol — check docs/protocol.md.
if ((import.meta as any).env?.DEV) {
  const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const expected = "55 21 00 00 03 00 00 00 00 00 03" + " 00".repeat(53);
  console.assert(hex(buildLightEffect(3)) === expected, "helios: buildLightEffect mismatch");
}
