import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { FILE_LIMITS } from '../config/constants';
import { AppError } from './error.middleware';

const uploadRoot = path.resolve(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, safeName);
  }
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: FILE_LIMITS.maxFileSizeBytes,
    files: FILE_LIMITS.maxFilesPerBidder
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new AppError(400, 'UNSUPPORTED_FILE_TYPE', `Unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  }
});
