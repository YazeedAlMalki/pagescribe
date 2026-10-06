// Pinned upstream revision 384182c7187c12d4ea181ae3b97c8b7e12089d9d; Apache-2.0. SHA-256 verified against Git LFS where available.
export const MODELS = Object.freeze({
  "detection": {
    "id": "paddle-v5-384182c7187c-detection",
    "url": "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/384182c7187c12d4ea181ae3b97c8b7e12089d9d/detection/PP-OCRv5_mobile_det_infer.onnx",
    "bytes": 4748769,
    "sha256": "d7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924",
    "language": "shared"
  },
  "english": {
    "id": "paddle-v5-384182c7187c-english",
    "url": "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/384182c7187c12d4ea181ae3b97c8b7e12089d9d/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx",
    "bytes": 7855803,
    "sha256": "1081b104a3c44d103511f150763d997a846994431c5775a800c802254c1124bf",
    "language": "en"
  },
  "arabic": {
    "id": "paddle-v5-384182c7187c-arabic",
    "url": "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/384182c7187c12d4ea181ae3b97c8b7e12089d9d/recognition/multi/arabic/v5/arabic_PP-OCRv5_mobile_rec_infer.onnx",
    "bytes": 8023442,
    "sha256": "b58f7d1cc7200566aae1d56ac26c17942881958ed100ac5a07d9a6e67150cbef",
    "language": "ar"
  },
  "englishDictionary": {
    "id": "paddle-v5-384182c7187c-englishDictionary",
    "url": "https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/384182c7187c12d4ea181ae3b97c8b7e12089d9d/recognition/multi/en/v5/ppocrv5_en_dict.txt",
    "bytes": 1417,
    "sha256": "c60d46e9e01d500ed6388fe8681051eac9cf6692e0d57238315be171927a0a1b",
    "language": "en"
  },
  "arabicDictionary": {
    "id": "paddle-v5-384182c7187c-arabicDictionary",
    "url": "https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/384182c7187c12d4ea181ae3b97c8b7e12089d9d/recognition/multi/arabic/v5/ppocrv5_arabic_dict.txt",
    "bytes": 2370,
    "sha256": "f6b5baf1335408e6e1fb5cc6e8268a26769f549c2bb37268e72a6804fe269b4c",
    "language": "ar"
  }
});
export const MODEL_BUDGET = 64 * 1024 * 1024;
export const modelSet = language => [MODELS.detection, MODELS[language === 'ar' ? 'arabic' : 'english'], MODELS[language === 'ar' ? 'arabicDictionary' : 'englishDictionary']];
