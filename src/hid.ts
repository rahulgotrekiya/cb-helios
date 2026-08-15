/**
 * Milestone 1: connect to the mouse and introspect its HID reports.
 *
 * We deliberately do NOT filter by vendor ID yet. We let you pick the Helios
 * from the browser's device chooser, so we can read its *real* vendorId /
 * productId and see exactly which reports it exposes. Later milestones will
 * hardcode those values as a filter once we've confirmed them.
 */

export async function requestHelios(): Promise<HIDDevice | null> {
  // Empty filter => the chooser lists every HID device Chrome will expose.
  // Chrome hides plain mouse/keyboard interfaces for security, but the Helios's
  // vendor-defined config interface will still appear — that's the one we want.
  const devices = await navigator.hid.requestDevice({ filters: [] });
  const device = devices[0];
  if (!device) return null;
  if (!device.opened) await device.open();
  return device;
}

const hex = (n: number) => "0x" + n.toString(16).padStart(4, "0");

export interface ReportSummary {
  reportId: number;
  byteLength: number; // payload bytes, excluding the leading report-ID byte
}

/**
 * TODO(human)
 * Given the reports of one collection, return one ReportSummary per report.
 *
 * Each HIDReportInfo has:
 *   report.reportId  -> number | undefined
 *   report.items     -> HIDReportItem[] | undefined
 * Each item describes a run of fields:
 *   item.reportSize  -> bits per field   (number | undefined)
 *   item.reportCount -> how many fields  (number | undefined)
 *
 * A report's payload size in BITS = sum over its items of
 *   (reportSize * reportCount).
 * Convert to bytes (÷ 8) for byteLength. Default any missing number to 0.
 *
 * Why this matters: every command we send later (set DPI, set RGB, remap, ...)
 * is a feature report of a fixed byte length. Knowing each report's id + size
 * is the first map we need to reverse-engineer the protocol.
 */
export function summarizeReports(reports: HIDReportInfo[]): ReportSummary[] {
  return []; // replace with your implementation
}

export function describeDevice(device: HIDDevice): string {
  const lines: string[] = [];
  lines.push(`Product : ${device.productName || "(unnamed)"}`);
  lines.push(`Vendor  : ${hex(device.vendorId)}   Product: ${hex(device.productId)}`);
  lines.push("");

  device.collections.forEach((col, i) => {
    const vendor = isVendorPage(col.usagePage) ? "   <-- vendor (config) interface" : "";
    lines.push(
      `Collection ${i}: usagePage=${hex(col.usagePage ?? 0)} usage=${hex(col.usage ?? 0)}${vendor}`
    );
    emit("feature", col.featureReports ?? []);
    emit("input", col.inputReports ?? []);
    emit("output", col.outputReports ?? []);
    lines.push("");
  });

  function emit(kind: string, reports: HIDReportInfo[]) {
    for (const r of summarizeReports(reports)) {
      lines.push(`   ${kind.padEnd(7)} report id=${r.reportId}  payload=${r.byteLength} bytes`);
    }
  }

  return lines.join("\n");
}

// Vendor-defined usage pages start at 0xFF00 — that's the config channel the
// official Orbit app talks to, and the one we care about.
function isVendorPage(usagePage?: number): boolean {
  return usagePage !== undefined && usagePage >= 0xff00;
}
