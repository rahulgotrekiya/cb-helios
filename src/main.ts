import { requestHelios, describeDevice } from "./hid";

const output = document.querySelector<HTMLPreElement>("#output")!;
const connectBtn = document.querySelector<HTMLButtonElement>("#connect")!;

// requestDevice() must be triggered by a user gesture (the click), and the
// page must be served over https or localhost — Vite's dev server is localhost.
connectBtn.addEventListener("click", async () => {
  if (!("hid" in navigator)) {
    output.textContent =
      "WebHID not supported here. Use desktop Chrome, Edge, Brave, Opera, or Vivaldi.";
    return;
  }
  try {
    const device = await requestHelios();
    if (!device) {
      output.textContent = "No device selected.";
      return;
    }
    output.textContent = describeDevice(device);
  } catch (err) {
    output.textContent = `Error: ${(err as Error).message}`;
  }
});
