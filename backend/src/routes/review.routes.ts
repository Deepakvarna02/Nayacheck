import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';
import { sessionService } from '../services/session/session.service';
import { asSingleParam } from '../utils/http';

const router = Router();

router.patch(
  '/:sessionId/item/:criterionId/bidder/:bidderId',
  validateBody(
    z.object({
      resolution: z.enum(['PASS', 'FAIL', 'ESCALATE']),
      reviewerName: z.string().min(2),
      reviewerDesignation: z.string().min(2),
      notes: z.string().min(5),
      timestamp: z.string().datetime()
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const bidderId = asSingleParam(req.params.bidderId);
      const criterionId = asSingleParam(req.params.criterionId);
      await sessionService.applyReviewResolution(sessionId, bidderId, {
        criterionId,
        resolution: req.body.resolution,
        reviewerName: req.body.reviewerName,
        reviewerDesignation: req.body.reviewerDesignation,
        notes: req.body.notes,
        timestamp: req.body.timestamp
      });

      res.json({
        updated: true,
        newVerdict: req.body.resolution,
        reviewedAt: req.body.timestamp,
        auditEntryAdded: true
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
