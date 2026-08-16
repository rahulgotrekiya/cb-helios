import { requestHelios, describeDevice, findConfigCollection } from "./hid";
import {
  LIGHT_EFFECTS,
  setLightEffect,
  POLLING_RATES,
  DEFAULT_SETTINGS,
  applySettings,
  sendRaw,
  parseHexBytes,
  type Settings,
} from "./helios";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const output = $<HTMLPreElement>("#output");
const replies = $<HTMLPreElement>("#replies");
const connectBtn = $<HTMLButtonElement>("#connect");
const effectSelect = $<HTMLSelectElement>("#effect");
const activeStage = $<HTMLSelectElement>("#activeStage");
const polling = $<HTMLSelectElement>("#polling");
const scrollRev = $<HTMLInputElement>("#scrollRev");
const applyBtn = $<HTMLButtonElement>("#applySettings");
const exportBtn = $<HTMLButtonElement>("#exportBtn");
const importFile = $<HTMLInputElement>("#importFile");
const raw = $<HTMLInputElement>("#raw");
const sendBtn = $<HTMLButtonElement>("#send");
const fieldsets = [...document.querySelectorAll<HTMLFieldSetElement>("fieldset")];
const dpiInputs = [...document.querySelectorAll<HTMLInputElement>(".dpi")];

let device: HIDDevice | null = null;

// Populate dropdowns from the protocol data.
LIGHT_EFFECTS.forEach((name, id) => effectSelect.append(new Option(name, String(id))));
for (let s = 1; s <= 6; s++) activeStage.append(new Option(`Stage ${s}`, String(s)));
POLLING_RATES.forEach((r) => polling.append(new Option(`${r.hz} Hz`, String(r.code))));

writeSettings(DEFAULT_SETTINGS);

const clampDpi = (n: number) => Math.min(10000, Math.max(100, Math.round((n || 0) / 100) * 100));

function writeSettings(s: Settings) {
  dpiInputs.forEach((el, i) => (el.value = String(s.dpi[i] ?? 0)));
  activeStage.value = String(s.activeStage);
  polling.value = String(s.pollingCode);
  scrollRev.checked = s.scrollReversed;
}

function readSettings(): Settings {
  return {
    dpi: dpiInputs.map((el) => clampDpi(Number(el.value))),
    activeStage: Number(activeStage.value),
    pollingCode: Number(polling.value),
    scrollReversed: scrollRev.checked,
  };
}

const hexOf = (d: DataView) =>
  [...new Uint8Array(d.buffer)].map((b) => b.toString(16).padStart(2, "0")).join(" ");

// Run a device action only when connected, with shared error reporting.
function withDevice(fn: (d: HIDDevice) => Promise<void>) {
  if (!device) return;
  fn(device).catch((err) => (output.textContent = `Error: ${(err as Error).message}`));
}

connectBtn.addEventListener("click", async () => {
  if (!("hid" in navigator)) {
    output.textContent = "WebHID not supported. Use desktop Chrome, Edge, or Brave.";
    return;
  }
  try {
    device = await requestHelios();
    if (!device) {
      output.textContent = "No device selected.";
      return;
    }
    output.textContent = describeDevice(device);
    const ok = !!findConfigCollection(device);
    fieldsets.forEach((f) => (f.disabled = !ok));
    if (ok) {
      device.addEventListener("inputreport", (e) => {
        replies.textContent = `id=${e.reportId}  ${hexOf(e.data)}`;
      });
    } else {
      output.textContent +=
        "\n\n⚠ No 64-byte command channel on this interface. Reconnect and pick another entry.";
    }
  } catch (err) {
    output.textContent = `Error: ${(err as Error).message}`;
  }
});

effectSelect.addEventListener("change", () =>
  withDevice(async (d) => {
    const id = Number(effectSelect.value);
    await setLightEffect(d, id);
    output.textContent = `Set effect: ${LIGHT_EFFECTS[id]}`;
  }),
);

applyBtn.addEventListener("click", () =>
  withDevice(async (d) => {
    const s = readSettings();
    writeSettings(s); // reflect clamped DPI values back into the inputs
    await applySettings(d, s);
    const hz = POLLING_RATES.find((r) => r.code === s.pollingCode)?.hz;
    output.textContent =
      `Applied — DPI ${s.dpi.join("/")}, active stage ${s.activeStage}, ` +
      `${hz} Hz, scroll ${s.scrollReversed ? "reversed" : "normal"}`;
  }),
);

exportBtn.addEventListener("click", () => {
  const profile = { settings: readSettings(), effect: Number(effectSelect.value) };
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "helios-profile.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const profile = JSON.parse(await file.text());
    if (profile.settings) writeSettings(profile.settings);
    if (typeof profile.effect === "number") effectSelect.value = String(profile.effect);
    output.textContent = 'Profile loaded. Click "Apply to mouse" and re-pick the effect to send it.';
  } catch (err) {
    output.textContent = `Import error: ${(err as Error).message}`;
  } finally {
    importFile.value = ""; // allow re-importing the same file
  }
});

sendBtn.addEventListener("click", () =>
  withDevice(async (d) => {
    const bytes = parseHexBytes(raw.value);
    await sendRaw(d, bytes);
    output.textContent = `Sent ${bytes.length} bytes.`;
  }),
);
