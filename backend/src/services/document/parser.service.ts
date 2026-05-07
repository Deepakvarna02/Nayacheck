import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { pdfService } from './pdf.service';
import { ocrService } from './ocr.service';
import type { DocumentManifest, DocumentQuality, ParsedDocumentBundle, ParsedPage } from './document.types';

function qualityFromTextLength(length: number): DocumentQuality {
  if (length > 5000) {
    return 'good';
  }
  if (length > 1200) {
    return 'partial';
  }
  if (length > 200) {
    return 'poor';
  }
  return 'scanned_unreadable';
}

async function parseDocx(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

function createDocumentId(): string {
  return `doc_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function mimeTypeForExtension(ext: string): string | null {
  if (ext === '.pdf') {
    return 'application/pdf';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

function buildManifest(
  ownerType: DocumentManifest['ownerType'],
  ownerId: string,
  filePath: string,
  parseMode: DocumentManifest['parseMode'],
  pages: ParsedPage[],
  qualityReason: string
): DocumentManifest {
  const combinedText = pages.map((page) => page.extractedText).join('\n').trim();
  const averageOcrConfidence =
    pages.filter((page) => typeof page.ocrConfidence === 'number').reduce((sum, page, _index, items) => {
      if (items.length === 0) {
        return 0;
      }
      return sum + (page.ocrConfidence ?? 0) / items.length;
    }, 0);
  const textQuality = qualityFromTextLength(combinedText.length);
  const ocrAdjustedQuality =
    averageOcrConfidence > 0
      ? averageOcrConfidence < 0.35
        ? 'scanned_unreadable'
        : averageOcrConfidence < 0.6
          ? 'poor'
          : textQuality
      : textQuality;
  return {
    documentId: createDocumentId(),
    ownerType,
    ownerId,
    originalName: path.basename(filePath),
    filePath,
    mimeType: mimeTypeForExtension(path.extname(filePath).toLowerCase()),
    parseMode,
    pageCount: pages.length,
    documentQuality: ocrAdjustedQuality,
    qualityReason,
    pages
  };
}

async function parseSingle(
  ownerType: DocumentManifest['ownerType'],
  ownerId: string,
  filePath: string
): Promise<DocumentManifest> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const pages = await pdfService.extractPages(filePath);
    const merged = pages.join('\n').trim();
    if (merged.length > 100) {
      return buildManifest(ownerType, ownerId, filePath, 'digital_pdf', pages.map((extractedText, index) => ({
        pageNumber: index + 1,
        extractedText
      })), 'Digital PDF text extraction succeeded.');
    }

    const ocrResult = await ocrService.extractText(filePath);
    return buildManifest(ownerType, ownerId, filePath, 'ocr_pdf', [
      {
        pageNumber: 1,
        extractedText: ocrResult.text,
        ocrConfidence: ocrResult.confidence
      }
    ], `Digital extraction returned limited text; OCR fallback used with ${(ocrResult.confidence * 100).toFixed(0)}% confidence.`);
  }

  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
    const ocrResult = await ocrService.extractText(filePath);
    return buildManifest(ownerType, ownerId, filePath, 'image_ocr', [
      {
        pageNumber: 1,
        extractedText: ocrResult.text,
        ocrConfidence: ocrResult.confidence
      }
    ], `Image OCR completed with ${(ocrResult.confidence * 100).toFixed(0)}% confidence.`);
  }

  if (ext === '.docx') {
    const extractedText = await parseDocx(filePath);
    return buildManifest(ownerType, ownerId, filePath, 'docx_text', [{ pageNumber: 1, extractedText }], 'DOCX raw text extraction succeeded.');
  }

  return buildManifest(ownerType, ownerId, filePath, 'docx_text', [{ pageNumber: 1, extractedText: '' }], 'Unsupported file type; no text extracted.');
}

export const parserService = {
  async extractAll(params: {
    ownerType: DocumentManifest['ownerType'];
    ownerId: string;
    filePaths: string[];
  }): Promise<ParsedDocumentBundle> {
    const manifests = await Promise.all(
      params.filePaths.map((filePath) => parseSingle(params.ownerType, params.ownerId, filePath))
    );
    const merged = manifests
      .map((manifest, index) => {
        const pageText = manifest.pages
          .map((page) => `Page ${page.pageNumber}\n${page.extractedText}`.trim())
          .join('\n\n');
        return `Document ${index + 1}: ${manifest.originalName}\n${pageText}`.trim();
      })
      .join('\n\n---\n\n')
      .trim();

    const documentQuality = qualityFromTextLength(merged.length);
    const qualityReason =
      documentQuality === 'good'
        ? 'Most uploaded documents yielded high-volume readable text.'
        : documentQuality === 'partial'
          ? 'Key text was extracted, but some files may still need reviewer spot-checking.'
          : documentQuality === 'poor'
            ? 'Only limited readable text was extracted; manual review is likely needed.'
            : 'Readable text could not be extracted reliably from one or more files.';

    return {
      text: merged,
      documentQuality,
      qualityReason,
      manifests,
      sources: manifests.map((manifest) => ({
        documentId: manifest.documentId,
        filePath: manifest.filePath,
        textLength: manifest.pages.reduce((sum, page) => sum + page.extractedText.length, 0),
        parseMode: manifest.parseMode,
        documentQuality: manifest.documentQuality
      }))
    };
  }
};
