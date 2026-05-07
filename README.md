# NyayaCheck: AI-Driven Tender Evaluation for CRPF Procurement

> **Fair. Auditable. Explainable.** — An intelligent procurement evaluation system that detects bias, ensures consistency, and maintains complete audit trails.

## � BST (Bidder Scoring & Thresholds)

The **Bidder Scoring & Thresholds (BST)** subsystem is the core evaluation engine:

- **Criteria Definition**: Each tender criterion has an `id`, `description`, `type` (mandatory/optional), `threshold`, and `verification_source` to guide bidder assessment.
- **Evidence Extraction**: Bidder documents (PDF/DOCX/images) are parsed and normalized into structured evidence linked to source locations (document, page, quote).
- **Per-Criterion Scoring**: Each bidder is scored `ELIGIBLE`, `NOT_ELIGIBLE`, or `NEEDS_REVIEW` per criterion with confidence levels (0–1) and explainable reasoning.
- **Overall Decision**: Criterion verdicts aggregate into an `overall_verdict` and `overall_confidence`, flagging any disqualifying criteria.
- **Manual Override & Simulation**: Officers can override extracted values and simulate verdict changes for what-if analysis.
- **Consistency Analysis**: Cross-bidder matrix detects if the same criterion is scored inconsistently, surfacing potential bias.

The BST engine uses heuristic decision logic combined with human checkpoints to ensure transparent, defensible procurement.

---

## �🎯 The Problem

**CRPF tender evaluation faces critical challenges:**
- **Human bias** in subjective scoring → same evidence scored differently for different bidders
- **Inconsistent interpretation** of criteria → one bidder fails on what another passes
- **No audit trail** → impossible to defend decisions if challenged
- **Scanned documents missed** → OCR errors lose critical evidence
- **Silent disqualifications** → bidders don't know why they failed

NyayaCheck solves this by making evaluation **transparent, consistent, and auditable**.

## ✨ Key Features

### 📄 Smart Tender Processing
- **Digital PDF parsing** with `pdf.js`
- **OCR for scanned documents** with confidence scoring (Tesseract)
- **Automatic criteria extraction** using AI (Claude)
- **Document quality classification** (good/partial/poor/unreadable)

### 👮 Officer Checkpoint (Human-in-Loop)
- Review extracted criteria before evaluation begins
- Approve thresholds, verify interpretation
- Flag ambiguities for manual handling
- **No silent automation** — humans control the gates

### 📊 Bidder Evaluation
- Upload bidder packets (PDF, images, DOCX)
- Criterion-by-criterion scoring with confidence levels
- **Evidence traceability** — every verdict links to source document, page, exact quote
- Automatic detection of inconsistencies across bidders

### 🔍 Consistency Analysis
- **Cross-bidder matrix** — see if same criterion scored differently
- **Bias detection** — highlights suspicious patterns
- **Manual review queue** — routes ambiguous cases to officers
- **Unresolved items dashboard** — track what still needs approval

### 📋 Audit Report & Sign-Off
- Formal record with integrity hash
- Exportable as PDF for archival
- Tamper-evident design
- Ready for procurement authority review

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
- **Node.js 18+** and npm
- **Docker** (optional, for containerized deployment)
- A **CRPF tender PDF** (or use sample for demo)

### Installation

```bash
# 1. Clone and install
git clone <repo>
cd nayacheck
npm install

# 2. Install workspace packages
npm install -w backend -w frontend

# 3. Create .env file in backend/
cat > backend/.env << EOF
NODE_ENV=development
PORT=4000
AI_PROVIDER=claude
LOG_LEVEL=debug
SESSION_DIR=./data/sessions
REDIS_DISABLED=true
EOF
```

### Running Locally

```bash
# Terminal 1: Start backend (Express server + APIs)
npm run dev:backend
# Listening on http://localhost:4000

# Terminal 2: Start frontend (Next.js + UI)
npm run dev:frontend
# Listening on http://localhost:3000
```

**Then open**: http://localhost:3000

---

## 📖 Typical Workflow

### 1️⃣ Upload Tender PDF
![Landing Page](./docs/screenshots/1-landing.png)
- Click "Upload Tender PDF" or use "Use Sample Tender" for demo
- System parses PDF, extracts criteria automatically
- **Case type shown**: "Active Case" (real) or "Practice Case" (sample)

### 2️⃣ Review Criteria (Officer Checkpoint)
![Criteria Review](./docs/screenshots/2-criteria.png)
- See all extracted criteria organized by **Mandatory** vs **Optional**
- Review thresholds and verification sources
- Check for ambiguities (flagged with ⚠️)
- Enter officer name and approve before evaluation
- **Can't skip** — ensures human oversight

### 3️⃣ Upload Bidder Packets
![Bidder Upload](./docs/screenshots/3-upload.png)
- Add each bidder's supporting documents
- Support formats: PDF, JPG, PNG, DOCX
- System detects document quality (digital/scanned/OCR confidence)

### 4️⃣ Run Evaluation
![Dashboard](./docs/screenshots/4-dashboard.png)
- System scores each bidder against each criterion
- Shows **Eligible** / **Not Eligible** / **Needs Review**
- **Consistency matrix** reveals cross-bidder patterns
- **Manual review queue** lists ambiguous cases

### 5️⃣ Review & Deep Dive
![Evidence Panel](./docs/screenshots/5-evidence.png)
- Click any bidder to see criterion-by-criterion evidence
- Every verdict traces back to: **document → page → exact quote**
- Officer can accept verdict or flag for manual review

### 6️⃣ Sign-Off Report
![Audit Report](./docs/screenshots/6-report.png)
- Evaluation summary with all verdicts
- Consistency score and flagged inconsistencies
- Audit trail with integrity hash
- Export as PDF for archival

---

## 🏗️ Architecture

### Backend (Express + TypeScript)

```
backend/src/
├── routes/                     # API endpoints
│   ├── tender.routes.ts       # Upload, criteria extraction
│   ├── evaluation.routes.ts   # Scoring, verdicts
│   └── report.routes.ts       # Audit records
├── services/
│   ├── document/parser.ts     # PDF/OCR parsing
│   ├── ai/criteria.ts         # Tender extraction
│   ├── ai/decision.ts         # Verdict generation
│   └── session/               # Session persistence
└── middleware/
    ├── error.ts               # Error handling
    ├── logger.ts              # Logging
    └── validate.ts            # Zod schemas
```

**Key Services:**
- **ParserService** — Detects file type, extracts text with pdf.js or Tesseract
- **CriteriaService** — Uses Claude API to extract structured criteria
- **DecisionService** — Scores bidders with confidence thresholds
- **SessionService** — Persists data in `backend/data/sessions/`

### Frontend (Next.js 14 + React 18)

```
frontend/
├── app/
│   ├── page.tsx               # Landing page (upload)
│   ├── evaluate/[sessionId]/  # Main workflow
│   │   ├── criteria/          # Officer checkpoint
│   │   ├── bidders/           # Evidence deep-dive
│   │   └── report/            # Sign-off
│   └── globals.css            # Typography & theme
└── components/
    ├── CriteriaTable.tsx      # Criteria display
    ├── EvidencePanel.tsx      # Verdict justification
    ├── ReviewQueue.tsx        # Manual review items
    ├── ConsistencyHeatmap.tsx # Bias detection
    └── LoadingSpinner.tsx     # UX feedback
```

**Design System:**
- **Typography**: IBM Plex Sans (body) + IBM Plex Serif (display)
- **Colors**: Emerald (✓ pass), Rose (✗ fail), Amber (? needs review)
- **Responsive**: Tailwind CSS with mobile-first breakpoints

---

## 🔧 API Endpoints

### Tender Management
```bash
# Upload and parse a tender PDF
POST /api/tender/upload
Content-Type: multipart/form-data
Body: { file: <PDF>, sourceMode: "active_case" }
Response: { sessionId, criteria, parseQuality }

# Use sample tender for demo
POST /api/tender/sample
Response: { sessionId, criteria, parseQuality }

# Get extracted criteria for a session
GET /api/tender/:sessionId/criteria
Response: { criteria, thresholds, uploadedBidders, sourceMode }
```

### Evaluation
```bash
# Submit bidder packets and trigger evaluation
POST /api/evaluate/:sessionId
Body: { bidders: [...], officerName: "..." }
Response: { verdicts, consistencyScore, manualReviewQueue }

# Get evaluation results
GET /api/evaluate/:sessionId/results
Response: { 
  summary: { eligible, notEligible, needsReview },
  bidders: [...],
  consistencyMatrix: [...],
  sourceMode
}
```

### Reports
```bash
# Get audit report
GET /api/report/:sessionId
Response: {
  auditId,
  integrityHash,
  summary,
  inconsistencies,
  unresolvedReviewItems,
  sourceMode
}
```

---

## 🧪 Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing Checklist
- [ ] Upload real CRPF tender PDF
- [ ] Verify criteria extraction matches tender
- [ ] Upload bidder packets (mix of PDF/images/scans)
- [ ] Check evaluation produces justified verdicts
- [ ] Verify consistency matrix detects cross-bidder patterns
- [ ] Test evidence deep-dive (source quotes visible)
- [ ] Export audit report as PDF
- [ ] Test on mobile device

---

## 📦 Deployment

### Docker
```bash
# Build and run with Docker Compose
docker-compose up --build

# Frontend: http://localhost:3000
# Backend: http://localhost:4000
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Use Redis for session caching (currently file-backed)
- [ ] Configure `AI_PROVIDER` with real Claude API key
- [ ] Add HTTPS/TLS certificates
- [ ] Set up database backups for session data
- [ ] Configure logging aggregation
- [ ] Test with 50+ bidder packets for scale

### Recommended Vercel Setup
NyayaCheck is best hosted as a split deployment:

- Frontend: Vercel, using `frontend/` as the project root
- Backend: Render, Railway, Fly.io, or another Node host that can run the Express API and file/session workflows
- Environment variable on Vercel: `API_BASE_URL=<your backend URL>`

The frontend proxy at `/api/proxy/*` will forward all requests to the backend URL above, so the Vercel app stays clean and the API can scale independently.

---

## 🛠️ Configuration

### Backend Environment Variables
```
NODE_ENV              # development | production
PORT                  # Server port (default: 4000)
AI_PROVIDER          # claude (default) | azure | openai
CLAUDE_API_KEY       # For real AI extraction (optional)
LOG_LEVEL            # debug | info | warn | error
SESSION_DIR          # Where sessions persist (./data/sessions)
REDIS_DISABLED       # true = file-backed, false = Redis (default: true)
```

### Frontend Environment Variables
```
API_BASE_URL         # Backend API base URL for Vercel/production
NEXT_PUBLIC_API_URL  # Optional fallback for local development (default: http://localhost:4000)
```

---

## 📊 Data Model

### Session
```json
{
  "sessionId": "sess_abc123",
  "sourceMode": "active_case",
  "createdAt": "2026-05-04T10:00:00Z",
  "status": "evaluation_complete",
  "bidders": [
    {
      "id": "bidder_1",
      "name": "Company A",
      "verdicts": [
        {
          "criterionId": "crit_1",
          "verdict": "PASS",
          "confidence": 0.92,
          "evidence": "document_quote_here",
          "source": { "document": "proposal.pdf", "page": 3 }
        }
      ]
    }
  ]
}
```

---

## 🎨 UI/UX Highlights

✅ **Clean information hierarchy** — Mandatory/optional criteria separated  
✅ **Color-coded verdicts** — Green (pass), Red (fail), Amber (review)  
✅ **Evidence traceability** — Every verdict links to source document  
✅ **Consistency matrix** — Visual cross-bidder pattern detection  
✅ **Loading feedback** — Spinners show what's happening  
✅ **Accessibility** — Keyboard navigation, screen reader support  
✅ **Mobile responsive** — Full workflow on tablets and phones  
✅ **PDF export** — Audit report downloadable and archivable  

---

## 🤝 Contributing

This is a hackathon submission for **Theme 3: Explainable AI for Government Procurement**. Issues and PRs welcome!

---

## 📄 License

MIT

---

## ❓ FAQ

**Q: Is this production-ready?**  
A: It's a hackathon MVP. For production, add Redis caching, database persistence, audit logging, and security review.

**Q: Can I use with other procurement bodies?**  
A: Yes! The system is generic — adapt criteria extraction and decision rules for any authority.

**Q: What if AI extraction fails?**  
A: Officers can manually enter criteria at the checkpoint. No silent automation.

**Q: How long does evaluation take?**  
A: Tender parsing: 10-30s. Bidder evaluation: 2-5s per bidder.

**Q: Is there an API for external systems?**  
A: Yes, see API endpoints above. Integrate with existing procurement portals.

---

## 📞 Support

For questions, check the [docs](./docs) folder or file an issue.

**Made for CRPF. Made for justice. Made to matter.**
