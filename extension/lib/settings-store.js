export const DEFAULT_SETTINGS = Object.freeze({ cacheHours: 24, modelCacheHours: 24, ocrLanguage: 'en', ocrRotation: 0, pdfForceOcr: false, downloadDirectoryName: '' });

export function validateSettings(settings) {
  const cacheHours = Number(settings.cacheHours);
  if (!Number.isInteger(cacheHours) || cacheHours < 1 || cacheHours > 720) {
    throw new Error('Cache duration must be a whole number from 1 to 720 hours.');
  }
  const modelCacheHours = Number(settings.modelCacheHours ?? 24);
  if (!Number.isInteger(modelCacheHours) || modelCacheHours < 1 || modelCacheHours > 720) throw new Error('Model cache duration must be a whole number from 1 to 720 hours.');
  const ocrLanguage = settings.ocrLanguage ?? 'en', ocrRotation = Number(settings.ocrRotation ?? 0);
  if (!['en', 'ar'].includes(ocrLanguage)) throw new Error('Select English or Arabic OCR.');
  if (![0, 90, 180, 270].includes(ocrRotation)) throw new Error('Select a supported image rotation.');
  return { cacheHours, modelCacheHours, ocrLanguage, ocrRotation, pdfForceOcr: settings.pdfForceOcr === true, downloadDirectoryName: String(settings.downloadDirectoryName || '').slice(0, 255) };
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return validateSettings({ ...DEFAULT_SETTINGS, ...settings });
}

export async function saveSettings(settings) {
  const value = validateSettings(settings);
  await chrome.storage.local.set({ settings: value });
  return value;
}
