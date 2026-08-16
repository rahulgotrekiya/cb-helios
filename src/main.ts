import { requestHelios, describeDevice, findConfigCollection } from "./hid";
import { LIGHT_EFFECTS, setLightEffect } from "./helios";

const output = document.querySelector<HTMLPreElement>("#output")!;
const connectBtn = document.querySelector<HTMLButtonElement>("#connect")!;
const effectSelect = document.querySelector<HTMLSelectElement>("#effect")!;

// Keep the connected device so the effect dropdown can send to it.
let device: HIDDevice | null = null;

// Fill the dropdown from the protocol's effect list (index = firmware effect id).
LIGHT_EFFECTS.forEach((name, id) => {
  const opt = document.createElement("option");
  opt.value = String(id);
  opt.textContent = name;
  effectSelect.append(opt);
});

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
      effectSelect.disabled = false; // this interface has the command channel
    } else {
      effectSelect.disabled = true;
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
