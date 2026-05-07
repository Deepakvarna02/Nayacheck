import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/;

router.post(
  '/gst',
  validateBody(
    z.object({
      gstin: z.string().min(1)
    })
  ),
  async (req, res) => {
    const normalized = req.body.gstin.replace(/\s+/g, '').toUpperCase();
    const formatValid = GSTIN_REGEX.test(normalized);

    res.json({
      gstin: normalized,
      status: formatValid ? 'Manual verification required' : 'Invalid GSTIN format',
      verified: false,
      source: 'manual_review'
    });
  }
);

export default router;
