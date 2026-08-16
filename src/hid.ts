/**
 * Milestone 1: connect to the mouse and introspect its HID reports.
 *
 * We deliberately do NOT filter by vendor ID yet. We let you pick the Helios
 * from the browser's device chooser, so we can read its *real* vendorId /
 * productId and see exactly which reports it exposes. Later milestones will
 * hardcode those values as a filter once we've confirmed them.
 */

export async function requestHelios(): Promise<HIDDevice | null> {
  // Broad filter: both known Helios vendor IDs, any usage page. The config
  // interface enumerates differently in wired vs dongle mode, so we let it show
  // in every mode, then confirm the right interface via findConfigCollection().
  const devices = await navigator.hid.requestDevice({
    filters: [
      { vendorId: 0xa8a4, usagePage: 0xff01 }, // wired: only the config channel shows
      { vendorId: 0xa8a5 }, // dongle: still exploring which interface is config
    ],
  });
  // If the chooser returned several interfaces, prefer the real config channel.
  const device = devices.find((d) => findConfigCollection(d)) ?? devices[0] ?? null;
  if (!device) return null;
  // ONLY open the config interface. Opening the composite input interface would
  // claim the mouse's keyboard/button HID from the OS and freeze the mouse.
  if (findConfigCollection(device) && !device.opened) {
    await device.open();
  }
  return device;
}

/**
 * Find the vendor config collection that carries our command channel: a vendor
 * usage page (>= 0xff00) whose OUTPUT report is the unnumbered report (id 0) —
 * the exact report Orbit sends on. Other vendor interfaces (e.g. 0xff06 with
 * output report id 11) are decoys we must NOT open or write to.
 */
export function findConfigCollection(device: HIDDevice): HIDCollectionInfo | null {
  for (const col of device.collections) {
    if ((col.usagePage ?? 0) < 0xff00) continue;
    if (col.outputReports?.some((r) => (r.reportId ?? 0) === 0)) return col;
  }
  return null;
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
  return reports.map((report) => {
    let bits = 0;
    for (const item of report.items ?? []) {
      // TODO(human): add this item's contribution to `bits`.
      // Each item is a run of fields: (reportSize) bits per field, (reportCount)
      // fields. So its contribution is reportSize * reportCount bits.
      // Use (item.reportSize ?? 0) and (item.reportCount ?? 0) to handle undefined.
      bits += (item.reportSize ?? 0) * (item.reportCount ?? 0);

    }
    return { reportId: report.reportId ?? 0, byteLength: bits / 8 };
  });
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
