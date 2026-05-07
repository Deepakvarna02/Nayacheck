import type Bull from 'bull';
import { parserService } from '../document/parser.service';
import { evidenceService } from '../ai/evidence.service';
import { decisionService } from '../ai/decision.service';
import { sessionService } from '../session/session.service';
import { logger } from '../../utils/logger';
import type { TenderCriteria } from '../../validators/tender.schema';

export interface BidderJob {
  sessionId: string;
  bidderId: string;
  filePaths: string[];
  criteriaJson: TenderCriteria;
}

export async function processBidderData(
  data: BidderJob,
  updateProgress?: (progress: number) => Promise<void> | void
): Promise<void> {
  const { sessionId, bidderId, filePaths, criteriaJson } = data;

  try {
    await updateProgress?.(10);
    await sessionService.setBidderStatus(sessionId, bidderId, 'processing');
    logger.info({ sessionId, bidderId, step: 'document_parsing_start' });
    const existingManifest = await sessionService.getBidderDocumentManifest(sessionId, bidderId);
    const parsedDocument:
      | Awaited<ReturnType<typeof parserService.extractAll>>
      | {
          text: string;
          documentQuality: 'good' | 'partial' | 'poor' | 'scanned_unreadable';
          qualityReason: string;
          manifests: NonNullable<Awaited<ReturnType<typeof sessionService.getBidderDocumentManifest>>>;
          sources: Array<{
            documentId: string;
            filePath: string;
            textLength: number;
            parseMode: 'digital_pdf' | 'ocr_pdf' | 'image_ocr' | 'docx_text';
            documentQuality: 'good' | 'partial' | 'poor' | 'scanned_unreadable';
          }>;
        } =
      existingManifest && existingManifest.length > 0
        ? {
            text: existingManifest
              .map((manifest, index) =>
                [`Document ${index + 1}: ${manifest.originalName}`, ...manifest.pages.map((page) => `Page ${page.pageNumber}\n${page.extractedText}`)].join('\n')
              )
              .join('\n\n---\n\n'),
            documentQuality: existingManifest.some((manifest) => manifest.documentQuality === 'scanned_unreadable')
              ? 'scanned_unreadable'
              : existingManifest.some((manifest) => manifest.documentQuality === 'poor')
                ? 'poor'
                : existingManifest.some((manifest) => manifest.documentQuality === 'partial')
                  ? 'partial'
                  : 'good',
            qualityReason: existingManifest.map((manifest) => manifest.qualityReason).join(' '),
            manifests: existingManifest,
            sources: existingManifest.map((manifest) => ({
              documentId: manifest.documentId,
              filePath: manifest.filePath,
              textLength: manifest.pages.reduce((sum, page) => sum + page.extractedText.length, 0),
              parseMode: manifest.parseMode,
              documentQuality: manifest.documentQuality
            }))
          }
        : await parserService.extractAll({
            ownerType: 'bidder',
            ownerId: bidderId,
            filePaths
          });

    if (!existingManifest || existingManifest.length === 0) {
      await sessionService.saveBidderDocumentManifest(sessionId, bidderId, parsedDocument.manifests);
    }

    await updateProgress?.(35);
    logger.info({ sessionId, bidderId, step: 'evidence_extraction_start' });
    const evidenceJson = await evidenceService.extract({
      sessionId,
      bidderId,
      criteriaJson,
      documentManifest: parsedDocument.manifests
    });
    evidenceJson.document_quality = parsedDocument.documentQuality;

    await updateProgress?.(70);
    logger.info({ sessionId, bidderId, step: 'decision_start' });
    const verdictJson = await decisionService.decide({
      sessionId,
      bidderId,
      criteriaJson,
      evidenceJson
    });

    await updateProgress?.(90);
    await sessionService.saveBidderResults(sessionId, bidderId, { evidenceJson, verdictJson });
    await sessionService.syncBidderReviewQueue(sessionId, bidderId, criteriaJson, evidenceJson, verdictJson);

    await updateProgress?.(100);
    logger.info({
      sessionId,
      bidderId,
      step: 'bidder_processing_complete',
      verdict: verdictJson.overall_verdict
    });
  } catch (error) {
    logger.error({ sessionId, bidderId, step: 'bidder_processing_failed', error });
    await sessionService.markBidderFailed(sessionId, bidderId, String(error));
    throw error;
  }
}

export async function processBidder(job: Bull.Job<BidderJob>): Promise<void> {
  await processBidderData(job.data, (progress) => job.progress(progress));
}
