# Ballers Kingdom Digital Products and Career Opportunity Funnel

**Date:** 2026-08-29  
**Status:** Approved in conversation; awaiting written-spec review  
**Repository:** `ballkingdom`

## 1. Objective

Expand the Ballers Kingdom website into a secure storefront for digital products and personalized solutions. The first release will merchandise three existing or planned products and introduce an automated career-opportunity funnel that converts a free personalized assessment into a paid report and, subsequently, a paid human service.

The system must preserve the existing Ballers Kingdom brand and website, protect resumes and customer data, verify payments independently, avoid unsupported claims, and keep outbound messages and production deployment behind Brian's approval.

## 2. Product Catalog

### 2.1 SBA-Ready Business Acquisition Toolkit

An evergreen guide and toolkit for identifying, evaluating, financing, and acquiring an operating small business. Position the product around the promise **Buy a Business. Not Another Job.** Current deal examples may support the toolkit but must not be presented as permanently available opportunities.

### 2.2 Home Inspection Study Guide

Convert the existing Home Inspection Guide into a paid digital product. Preserve the current guide-generation pipeline, source materials, web edition, and PDF. The public storefront must not reveal the protected full PDF or expose a permanent public file URL after the paywall is active.

### 2.3 Personalized Career Opportunity Blueprint

A customized, AI-assisted career report created from a secure intake and resume upload. It is the paid solution in a value-first funnel rather than a generic downloadable template.

### 2.4 Career Strategy & Network Navigation

A paid human service offered after delivery of the Personalized Career Opportunity Blueprint. The service includes a tailored human review and strategy package with a promised turnaround of five business days. Relevant network-based introductions may be considered when appropriate and available, but are never promised or guaranteed.

### 2.5 Custom Solutions

Every product page should clarify that Ballers Kingdom can create customized guides, reports, opportunity maps, and related solutions for other individuals or organizations. A dedicated inquiry path will collect the request without promising feasibility, price, delivery, or results before review.

## 3. Recommended Architecture

Keep the public marketing surface visually integrated with the existing Ballers Kingdom website. Add a secure Firebase-backed application layer for customer identity, intake data, resume uploads, report generation, entitlements, protected delivery, and audit events.

The public site may remain statically hosted where appropriate. Sensitive operations must run through authenticated backend functions. Resumes, intake answers, generated reports, payment credentials, and customer records must never be committed to Git or exposed as public static assets.

### Core components

1. **Public product storefront** — catalog, product pages, pricing/availability state, disclaimers, and calls to action.
2. **Secure intake application** — save-and-resume career intake and private resume upload.
3. **Snapshot generator** — produces the free Career Opportunity Snapshot.
4. **Opportunity research pipeline** — finds and validates current opportunities from attributable sources.
5. **Blueprint generator** — creates the paid report and private web edition.
6. **QuickBooks commerce adapter** — creates or uses the officially supported Intuit checkout mechanism and verifies completed payment server-side.
7. **Entitlement service** — unlocks only the purchased product for the correct customer.
8. **Protected delivery service** — supplies a private web view and short-lived PDF download.
9. **Premium-service workflow** — captures the human-service order, communicates the five-business-day turnaround, and tracks internal status.
10. **Operator controls** — allow Brian to inspect orders, reports, flagged matches, delivery status, and audit events without exposing secrets.

## 4. Career Funnel

```text
Public career landing page
        -> secure intake and resume upload
        -> free Career Opportunity Snapshot
        -> preview of locked Blueprint sections
        -> QuickBooks hosted checkout
        -> independent server-side payment verification
        -> paid Blueprint entitlement
        -> private web report and expiring PDF download
        -> Career Strategy & Network Navigation offer
        -> optional custom inquiry or human-service purchase
```

The intake comes before payment. The free result must provide genuine stand-alone value while naturally demonstrating the value of the deeper report. The customer must never be led to believe that completing the intake has created a payment obligation.

## 5. Intake Experience

Use a short, step-by-step experience with progress indication, save-and-resume support, accessible form controls, clear validation, and plain-language privacy notices.

### Step 1: Starting point

- Name and email
- City, state, and preferred work geography
- Work authorization, using a narrowly scoped question and optional explanatory text
- Current employment situation
- Primary outcome sought

### Step 2: Resume and experience

- Private resume upload
- Current and recent roles
- Education
- Licenses and certifications
- Skills, tools, languages, and notable accomplishments

### Step 3: Opportunity preferences

- Target roles and industries
- Remote, hybrid, onsite, or flexible preference
- Travel radius and relocation willingness
- Compensation goals
- Full-time, part-time, contract, consulting, entrepreneurship, or open-to-options selection

### Step 4: Practical requirements

- Availability and desired start date
- Schedule constraints
- Transportation considerations
- Accessibility or workplace considerations, only when voluntarily supplied and necessary for matching

### Step 5: Professional direction

- Work that energizes the customer
- Work the customer wants to avoid
- Near-term and long-term goals
- Organizations or sectors of interest
- Networking comfort and existing relationships
- Biggest current obstacle

### Step 6: Consent and privacy

- Consent to process the resume and answers for the requested service
- Clear retention and deletion terms
- Separate, optional consent for future marketing contact
- Confirmation that the intake is free and does not constitute a purchase
- Notice that opportunity availability changes and must be verified before action

Do not request protected or highly sensitive information unless it is essential. Do not request Social Security numbers, dates of birth, banking information, account passwords, or government-identification uploads.

## 6. Free Career Opportunity Snapshot

The Snapshot is a personalized one-page result generated after intake. It includes:

- Professional headline
- Concise professional profile
- Transferable strengths
- Recommended opportunity directions
- Readiness gaps or positioning opportunities
- Three immediate actions
- A limited preview of matched opportunity categories

It must not expose paid report content, fabricate recommendations, or pretend to be a hiring decision. It should explain which inputs influenced its recommendations and invite correction when the customer's information was interpreted incorrectly.

## 7. Personalized Career Opportunity Blueprint

The paid Blueprint includes:

- Personalized professional profile and positioning
- Prioritized role matches with fit explanations
- Current, source-linked job and professional opportunities
- Employers and organizations to target
- Application and search strategy
- Resume-positioning recommendations
- Networking targets and adaptable outreach prompts
- Relevant training, credential, fellowship, grant, contract, or entrepreneurial opportunities
- Risks, readiness gaps, and practical next steps
- A 30/60/90-day action plan
- Source URLs, retrieval dates, and availability notices

The system should prepare enough of the report before checkout to show an accurate preview and support immediate delivery after verified payment. Expensive or time-consuming generation should be queued safely, with a clear progress state if completion takes longer than the checkout interaction.

Every live opportunity must have an attributable source and retrieval timestamp. Listings must be labeled as current as of that timestamp, not guaranteed open. The system must not invent roles, contacts, compensation, deadlines, introductions, or employer interest.

## 8. QuickBooks Commerce and Payment Gate

Use current official Intuit documentation during implementation. Verify the supported QuickBooks Online and QuickBooks Payments capabilities before selecting endpoints or checkout objects. Do not invent a payment-link, hosted-page, webhook, or transaction-verification workflow.

Required behavior:

- Use an official Intuit-hosted checkout, payment link, Buy button, invoice flow, or other supported mechanism selected during implementation research.
- Store Intuit credentials only in an approved secret store.
- Keep OAuth tokens and company identifiers out of client-side code and Git.
- Treat the browser return URL as navigation only, never proof of payment.
- Verify payment server-side against Intuit-controlled transaction state before creating an entitlement.
- Correlate the payment to the correct intake, customer, product, amount, and internal order.
- Make payment processing idempotent so retries cannot create duplicate orders or entitlements.
- Record refunds and revoke or annotate access according to the approved refund policy.
- Never release a protected report based solely on a client-supplied status value.

If official QuickBooks capabilities cannot provide reliable immediate payment confirmation for this flow, stop before launch and present the supported alternatives and trade-offs to Brian.

## 9. Entitlement and Delivery

After verified payment:

- Create one auditable entitlement for the customer and purchased product.
- Display the Blueprint in a private authenticated web view.
- Generate a branded PDF without embedding private source documents.
- Serve downloads through short-lived signed URLs or authenticated backend streaming.
- Avoid permanent public PDF URLs.
- Apply a light customer license marker, order reference, or watermark when appropriate.
- Allow the customer to re-access purchased content through the same verified identity.

The system should discourage casual sharing without claiming that PDF piracy can be made impossible.

## 10. Premium Human Service

After Blueprint delivery, offer **Career Strategy & Network Navigation** as a separate paid service.

The offer will state:

- Tailored human review and strategy work
- Five-business-day turnaround, beginning after payment and receipt of all required information
- The exact included deliverables before purchase
- Relevant introductions may be explored when appropriate and available
- No guarantee of introductions, interviews, offers, employment, funding, or other outcomes

The workflow must not automatically contact employers, recruiters, partners, or network members. All outbound communication remains draft-first and requires Brian's explicit approval.

## 11. Product Storefront and Brand Experience

Add a clear **Digital Products & Personalized Solutions** destination to Ballers Kingdom navigation and appropriate homepage sections.

Each product card or page should communicate:

- The customer's problem
- The promised deliverable
- What is included
- Whether delivery is instant, generated, or human-reviewed
- The price or a clear inquiry state
- A direct action label
- Limitations and appropriate disclaimers

The storefront must preserve the existing black Ballers Kingdom identity while expanding the brand beyond sports. The visual signature should communicate an organized playbook: each product is presented as a practical route from a current position to a defined next move. Avoid generic SaaS gradients, stock dashboard imagery, and unsupported outcome claims.

Recommended action labels:

- **Get the Acquisition Toolkit**
- **Get the Home Inspection Guide**
- **Build My Free Career Snapshot**
- **Unlock My Personalized Blueprint**
- **Request a Custom Solution**

## 12. Privacy, Security, and Data Lifecycle

- Use least-privilege Firebase rules and backend service identities.
- Require identity or an email-bound secure access mechanism before displaying private data.
- Restrict each customer to their own intake, uploads, reports, and orders.
- Validate file type, size, and content server-side; reject executable or unsupported uploads.
- Scan or quarantine uploaded files when practical before downstream processing.
- Remove resume content and personal data from application logs.
- Do not send resume content to an AI provider until the provider, retention behavior, and disclosure language are reviewed.
- Record consent version and timestamp.
- Define retention periods for abandoned intakes, purchased reports, uploads, and audit records.
- Provide an authenticated deletion-request path.
- Preserve only the minimum financial transaction metadata necessary for reconciliation and support.
- Use App Check, rate limiting, abuse controls, and bot protection appropriate to the final Firebase architecture.
- Keep staging/sandbox and production data separated.

## 13. Failure and Recovery Behavior

- If resume upload fails, preserve completed intake answers and provide a specific retry action.
- If Snapshot generation fails, keep the intake and queue a retry without creating duplicate records.
- If QuickBooks is unavailable, do not accept an unverified unlock; show a safe pending state.
- If payment succeeds but confirmation is delayed, show **Payment verification in progress** and reconcile automatically.
- If report generation is incomplete after payment, preserve the entitlement and show generation status rather than an empty download.
- If a live opportunity disappears, retain the original source timestamp and clearly mark it unavailable when detected.
- If customer matching is ambiguous, require a verified identity step instead of guessing.
- Administrators must be able to reconcile orphaned payments, failed reports, and delivery problems through auditable operator controls.

## 14. Testing and Verification

Before production launch, verify:

- Intake validation, save/resume, and accessibility
- Resume-upload authorization and file validation
- Cross-user data isolation in Firebase rules tests
- Snapshot generation from representative and malformed inputs
- Source attribution and stale-opportunity handling
- Blueprint generation and PDF rendering
- QuickBooks sandbox OAuth, checkout, payment confirmation, retries, and refunds
- Idempotent payment-to-entitlement processing
- Protection against forged return URLs and client-side payment flags
- Expiring download links and unauthorized access attempts
- Premium-service turnaround language and introduction disclaimers
- Mobile and desktop storefront behavior
- Secret scanning, dependency audit, and repository safety checks
- Independent live smoke tests against the deployed preview

No real invoice, payment request, customer message, or network introduction may be sent during testing.

## 15. Launch Phases

### Phase 1: Storefront foundation

Add the product catalog, product pages, custom-solutions inquiry, disclosure language, and conversion instrumentation. Use non-operational purchase states until the secure commerce path is verified.

### Phase 2: Career intake and free Snapshot

Build secure identity, resume upload, intake, save/resume, Snapshot generation, and privacy controls.

### Phase 3: QuickBooks payment and protected Blueprint

Complete official Intuit capability research, sandbox authentication, payment verification, entitlements, report generation, and protected delivery.

### Phase 4: Premium human service

Add the five-business-day paid service, internal work queue, customer status, and guarded outbound workflow.

### Phase 5: Production release

Complete security review, accessibility review, browser QA, sandbox evidence, rollback planning, scoped deployment approval, production authentication, and post-deploy smoke tests.

## 16. Out of Scope for the Initial Release

- Guaranteed job placement or employer introductions
- Automated applications or messages to employers
- Public resume profiles
- Recurring subscription billing
- Broad web crawling without source and policy review
- Legal, employment, financial, or tax advice
- Production QuickBooks transactions before sandbox validation
- Automatic refunds, voids, or destructive accounting actions

## 17. Success Criteria

The release is successful when:

- Visitors can understand and navigate the three-product catalog.
- A visitor can complete the career intake and upload a resume securely.
- The system produces a useful free Career Opportunity Snapshot.
- The paid Blueprint preview clearly differentiates free and paid value.
- QuickBooks payment is verified server-side in sandbox before any entitlement is granted.
- A paid customer can access a private web report and protected PDF.
- Every reported live opportunity includes a source and retrieval date.
- The premium service accurately promises a five-business-day turnaround and makes no introduction or employment guarantee.
- Private data, reports, tokens, and payment credentials remain outside Git and public static hosting.
- Automated tests, security checks, accessibility checks, and preview smoke tests pass.
- No outbound message or production deployment occurs without Brian's explicit approval.

