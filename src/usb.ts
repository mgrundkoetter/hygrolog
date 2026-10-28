// Transports to connected loggers: the desktop app's HID bridge (src-tauri/src/usb.rs), or WebHID in
// Chromium-based browsers. Both only move packets; the protocol is in elitech.ts.

import { PRODUCT_ID, VENDOR_ID, type Transport } from './elitech';

const tauri = '__TAURI_INTERNALS__' in window;
const webHid = !tauri && 'hid' in navigator;

export const usbAvailable = tauri || webHid;

const TIMEOUT_MS = 5000;

// ---------- desktop ----------

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

const bridged = (id: string): Transport => ({
  exchange: async (request) => Uint8Array.from(await invoke<number[]>('hid_exchange', { id, request: Array.from(request) })),
});

// ---------- browser ----------

class WebHidLogger implements Transport {
  private waiting?: (report: Uint8Array) => void;

  constructor(private device: HIDDevice) {
    device.addEventListener('inputreport', (e) => {
      this.waiting?.(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
      this.waiting = undefined;
    });
  }

  async exchange(request: Uint8Array): Promise<Uint8Array> {
    if (!this.device.opened) await this.device.open();
    const response = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error('no response'));
      }, TIMEOUT_MS);
      this.waiting = (report) => {
        clearTimeout(timer);
        resolve(report);
      };
    });
    // No report IDs: report 0 carries the packet, padded to the 64-byte report size.
    const report = new Uint8Array(64);
    report.set(request);
    await this.device.sendReport(0, report);
    return response;
  }
}

const webHidLoggers = new WeakMap<HIDDevice, WebHidLogger>();

const isLogger = (d: HIDDevice) => d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID;

/**
 * The browser only hands out devices the user has picked once. `ask` shows the picker if none is
 * known yet; it needs a user gesture, so background polling passes false.
 */
async function webHidDevices(ask: boolean): Promise<HIDDevice[]> {
  let devices = (await navigator.hid.getDevices()).filter(isLogger);
  if (!devices.length && ask) {
    // Closing the picker without a choice rejects; that is the same as no logger.
    devices = await navigator.hid
      .requestDevice({ filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }] })
      .catch(() => []);
  }
  return devices;
}

// ---------- both ----------

/** Transports for all connected loggers; may be empty. */
export async function connectedLoggers(ask: boolean): Promise<Transport[]> {
  if (tauri) return (await invoke<string[]>('hid_list')).map(bridged);
  if (!webHid) return [];
  return (await webHidDevices(ask)).map((d) => {
    if (!webHidLoggers.has(d)) webHidLoggers.set(d, new WebHidLogger(d));
    return webHidLoggers.get(d)!;
  });
}
