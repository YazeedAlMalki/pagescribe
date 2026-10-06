import { ConversionError } from '../errors.js';
import { MiB } from '../limits.js';

export class MemoryMonitor {
  constructor({ deviceMemory = globalThis.navigator?.deviceMemory, performance = globalThis.performance } = {}) {
    this.deviceMemory = deviceMemory;
    this.performance = performance;
    this.reserved = 0;
    // Conservative reservations, not a measurement of total system/worker RAM.
    this.budget = Math.min(1024, deviceMemory ? deviceMemory * 1024 * 0.15 : 512) * MiB;
  }

  assertSupported() {
    if (this.deviceMemory && this.deviceMemory < 4) {
      throw new ConversionError('LOW_MEMORY_DEVICE', 'Parallel batches require a device reporting at least 4 GB RAM.');
    }
  }

  estimate(size, format) {
    // Compressed documents can expand far beyond their input size. Reserve a
    // higher floor while keeping five small Office/archive files concurrent.
    const floor = ['pdf', 'image', 'zip'].includes(format) ? 320 : ['xlsx', 'xls', 'docx', 'epub', 'pptx'].includes(format) ? 96 : 20;
    return floor * MiB + size * 8;
  }

  isUnderPressure() {
    const heap = this.performance?.memory;
    return Boolean(heap?.jsHeapSizeLimit && heap.usedJSHeapSize / heap.jsHeapSizeLimit > 0.85);
  }

  canReserve(bytes) { return this.reserved + bytes <= this.budget; }
  reserve(bytes) { this.reserved += bytes; }
  release(bytes) { this.reserved = Math.max(0, this.reserved - bytes); }

  snapshot() {
    return { deviceMemory: this.deviceMemory || null, reservedBytes: this.reserved, budgetBytes: this.budget,
      heapUsedBytes: this.performance?.memory?.usedJSHeapSize ?? null, pressure: this.isUnderPressure() };
  }
}
