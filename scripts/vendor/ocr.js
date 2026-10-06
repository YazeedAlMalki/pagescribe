import * as ort from 'onnxruntime-web';
export { PaddleOcrService } from 'ppu-paddle-ocr/web';
export function configureRuntime(base) {
  ort.env.wasm.wasmPaths = base;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}
