import { requestHelios, describeDevice, findConfigCollection } from "./hid";
import { LIGHT_EFFECTS, setLightEffect, sendRaw, parseHexBytes } from "./helios";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const output = $<HTMLPreElement>("#output");
const replies = $<HTMLPreElement>("#replies");
const connectBtn = $<HTMLButtonElement>("#connect");
const effectSelect = $<HTMLSelectElement>("#effect");
const raw = $<HTMLInputElement>("#raw");
const sendBtn = $<HTMLButtonElement>("#send");

let device: HIDDevice | null = null;

// Fill the dropdown from the protocol's effect list (index = firmware effect id).
LIGHT_EFFECTS.forEach((name, id) => {
  const opt = document.createElement("option");
  opt.value = String(id);
  opt.textContent = name;
  effectSelect.append(opt);
});

const hexOf = (data: DataView) =>
  [...new Uint8Array(data.buffer)].map((b) => b.toString(16).padStart(2, "0")).join(" ");

function enableControls(on: boolean) {
  for (const el of [effectSelect, raw, sendBtn]) el.disabled = !on;
}

connectBtn.addEventListener("click", async () => {
  if (!("hid" in navigator)) {
    output.textContent =
      "WebHID not supported here. Use desktop Chrome, Edge, Brave, Opera, or Vivaldi.";
    return;
  }
  try {
    device = await requestHelios();
    if (!device) {
      output.textContent = "No device selected.";
      return;
    }
    output.textContent = describeDevice(device);
    if (findConfigCollection(device)) {
      enableControls(true);
      // Show whatever the mouse sends back (replies to read commands, etc.).
      device.addEventListener("inputreport", (e) => {
        replies.textContent = `id=${e.reportId}  ${hexOf(e.data)}`;
      });
    } else {
      enableControls(false);
      output.textContent +=
        "\n\n⚠ No 64-byte command channel on this interface. Disconnect, reconnect, and pick a different Helios entry.";
    }
  } catch (err) {
    output.textContent = `Error: ${(err as Error).message}`;
  }
});

effectSelect.addEventListener("change", async () => {
  if (!device) return;
  const effectId = Number(effectSelect.value);
  try {
    await setLightEffect(device, effectId);
    output.textContent = `Set effect: ${LIGHT_EFFECTS[effectId]}`;
  } catch (err) {
    output.textContent = `Error: ${(err as Error).message}`;
  }
});

sendBtn.addEventListener("click", async () => {
  if (!device) return;
  try {
    const bytes = parseHexBytes(raw.value);
    await sendRaw(device, bytes);
    output.textContent = `Sent ${bytes.length} bytes: ${bytes
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")}`;
  } catch (err) {
    output.textContent = `Error: ${(err as Error).message}`;
  }
});
