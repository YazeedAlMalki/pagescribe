import { convertFile } from '../router.js';
import { errorInfo } from '../errors.js';
import { createOcrSession } from '../ocr/service.js';

self.onmessage = async ({ data }) => {
  const context = {
    options: data.options || {},
    report: stage => self.postMessage({ type: 'progress', id: data.id, stage }),
    phase: phase => self.postMessage({ type: 'phase', id: data.id, phase })
  };
  context.ocr = createOcrSession(context);
  try {
    const result = await convertFile(data, context);
    self.postMessage({ type: 'result', id: data.id, result });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, error: errorInfo(error) });
  } finally { await context.ocr.close().catch(() => {}); }
};
