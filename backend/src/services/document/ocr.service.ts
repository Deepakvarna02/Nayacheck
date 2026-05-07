import { createWorker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
}

export const ocrService = {
  async extractText(filePath: string): Promise<OcrResult> {
    const worker = await createWorker('eng');
    try {
      const result = await worker.recognize(filePath);
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence / 100
      };
    } finally {
      await worker.terminate();
    }
  }
};
