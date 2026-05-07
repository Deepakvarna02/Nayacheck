export type DocumentQuality = 'good' | 'partial' | 'poor' | 'scanned_unreadable';

export type ParseMode = 'digital_pdf' | 'ocr_pdf' | 'image_ocr' | 'docx_text';

export interface ParsedPage {
  pageNumber: number;
  extractedText: string;
  ocrConfidence?: number;
}

export interface DocumentManifest {
  documentId: string;
  ownerType: 'tender' | 'bidder';
  ownerId: string;
  originalName: string;
  filePath: string;
  mimeType: string | null;
  parseMode: ParseMode;
  pageCount: number;
  documentQuality: DocumentQuality;
  qualityReason: string;
  pages: ParsedPage[];
}

export interface ParsedDocumentBundle {
  text: string;
  documentQuality: DocumentQuality;
  qualityReason: string;
  manifests: DocumentManifest[];
  sources: Array<{
    documentId: string;
    filePath: string;
    textLength: number;
    parseMode: ParseMode;
    documentQuality: DocumentQuality;
  }>;
}
