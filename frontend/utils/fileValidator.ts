/**
 * File validation utilities for secure file upload handling
 */

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME_TYPES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b, 0x03, 0x04
  ], // PK..
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47]
};

const MIME_TYPE_MAP: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png']
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Validates file before upload
 */
export async function validateFile(file: File): Promise<FileValidationResult> {
  // Check file size
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
      suggestion: 'Please select a valid file with content.'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File too large (${sizeMB}MB)`,
      suggestion: 'Maximum file size is 20MB. Please compress or split the document.'
    };
  }

  // Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'docx', 'jpg', 'jpeg', 'png'];

  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File type not supported (.${extension})`,
      suggestion: 'Supported formats: PDF, DOCX, JPG, PNG'
    };
  }

  // Verify file content by magic bytes (prevent spoofing)
  const buffer = await file.slice(0, 4).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const magicBytes = Array.from(bytes);

  const isValidMagic = Object.entries(ALLOWED_MIME_TYPES).some(([_, expectedBytes]) => {
    return expectedBytes.every((byte, index) => magicBytes[index] === byte);
  });

  if (!isValidMagic) {
    return {
      valid: false,
      error: 'File content does not match the file type',
      suggestion: 'This file appears to be corrupted or misnamed. Please verify and retry.'
    };
  }

  return { valid: true };
}

/**
 * Gets user-friendly error message
 */
export function getFileErrorMessage(file: File, validationResult: FileValidationResult): string {
  if (!validationResult.valid) {
    return validationResult.suggestion
      ? `${validationResult.error} — ${validationResult.suggestion}`
      : validationResult.error || 'File validation failed';
  }
  return '';
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
