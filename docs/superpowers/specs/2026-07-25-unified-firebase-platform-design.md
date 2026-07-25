# The Ballers Kingdom Unified Firebase Platform — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-25  
**Canonical public domain:** `ballkingdom.com`

## Goal

Make The Ballers Kingdom one secure, Firebase-hosted platform. The public
website, growth-path intake, client dashboards, home-inspection experience,
and international customized-apparel shop must operate as a coherent product
instead of sending visitors to disconnected GitHub Pages, Replit, or separate
Firebase sites.

## Decisions

- Firebase Hosting is the sole website host for `ballkingdom.com` and `www`.
  GoDaddy remains DNS-only and Microsoft 365 mail records must be preserved.
- The experience is public-first. Authentication is required only when a
  visitor applies, books, enters a protected workflow, or checks out.
- A person can select multiple growth paths and has one adaptive account,
  **My Kingdom**, rather than separate accounts per service.
- The website remains Firebase-native: Hosting, Authentication, Firestore,
  Storage, Cloud Functions, and App Check form the core. External providers
  are integrated server-side only for payments, fulfillment, scheduling, and
  transactional communications.
- The existing inspection application becomes a protected module in the
  unified platform; it is no longer a separate Firebase destination.
- Replit links are replaced only after equivalent Firebase routes pass
  verification. GitHub Pages remains the rollback origin until the custom
  domain cutover is accepted.

## Public Information Architecture

The homepage retains the approved bold Ballers Kingdom visual identity while
reducing header clutter.

| Header element | Destination and purpose |
| --- | --- |
| Brand logo | Homepage |
| Services | Training, Consulting, Student/University Consulting, Home Inspections, and Partner Services |
| Products | Apparel Shop, custom apparel requests, and order support |
| My Kingdom | Secure adaptive account dashboard |
| Start Your Growth Path | Shared public intake and account-entry flow |

Existing Readiness, Inner Game, Site Audit, booking, and inspection content is
retained or migrated only as relevant content inside its correct service route
or dashboard module. Broken Replit "Open App" links are not retained.

## Audience Journeys

The `/join` flow lets a visitor choose one or more paths. Each selection
creates a service-specific intake and unlocks the applicable account module
after account creation or owner approval.

| Audience | First-release capabilities |
| --- | --- |
| Athletes and families | Training intake, session/program requests, assigned resources, milestones, updates, and gear purchases |
| Consulting clients | Service inquiry, discovery scheduling, intake, approved deliverables, next steps, and account communications |
| Students and universities | Student or institutional consulting inquiry, partnership goals, requests, and assigned materials |
| Home-inspection clients | Service request, appointment/property details, protected reports and documents, and follow-up actions |
| Partners | Collaboration/referral intake, approved shared opportunities, and explicitly shared resources |
| Shop customers | Eligible-item personalization, final price, payment, order history, fulfillment, and shipping tracking |
| Brian and authorized team | Unified owner console to review intakes, manage service status and visibility, publish resources, control margins, and resolve orders |

## Authorization and Data Boundaries

- Firestore and Storage are deny-by-default.
- A user can read or change only their own profile, records, orders,
  submissions, and files, plus items explicitly shared with them.
- Owner and team access is role-based and recorded. Administrative privileges
  are granted server-side, never trusted from a browser-supplied role.
- Sensitive inspection reports and consulting deliverables use protected
  metadata and Storage rules; downloadable file URLs are authorized on demand.
- All public writes are validated and rate-limited. App Check protects browser
  access and callable/API endpoints.
- Provider secrets, payment configuration, margin calculations, and
  fulfillment API calls remain in server-side secret stores and Functions.

## Commerce

The shop supports real international fulfillment through a print-on-demand
supplier selected during implementation research. The platform owns the
customer experience, product eligibility, price presentation, margin rules,
order record, and account history. A payment provider handles payments and the
supplier receives only the order/fulfillment details required to ship it.

The provider must support international shipping, customized eligible apparel,
reliable order-status synchronization, and a secure integration path suitable
for Firebase Functions. Provider selection, real payment activation, and live
supplier credentials are release gates; none are committed to source control.

## Deployment and Cutover

1. Establish a versioned Firebase project configuration and preview workflow.
2. Deploy the unified public site to a Firebase preview/default Hosting URL;
   confirm it does not disclose protected data.
3. Implement shared public intake and account creation, then the adaptive My
   Kingdom shell and owner console.
4. Bring inspection functionality into the unified data and route model.
5. Add athlete, consulting, student/university, and partner workflows.
6. Add the international apparel checkout and fulfillment integration after
   supplier/payment approval.
7. Verify public pages, signed-in journeys, authorization-denial probes,
   mobile behavior, and order/intake error handling.
8. With explicit authorization, attach `ballkingdom.com` and `www` to Firebase
   Hosting, update only the required GoDaddy web DNS records, and preserve all
   Microsoft 365 records.
9. Monitor the live cutover. GitHub Pages is retained as the documented
   rollback origin until acceptance.

## Out of Scope for the First Cutover

- Deleting the GitHub Pages configuration or historic content.
- Changing Microsoft 365 mail, MX, SPF, DKIM, DMARC, or autodiscover records.
- Activating payment collection or fulfillment before provider selection,
  compliant terms, tax/shipping policy, and explicit approval.
- Exposing client reports, consulting documents, or internal notes publicly.
- Any unapproved production deployment, DNS modification, provider account
  creation, or credential/session use.

## Verification Requirements

- Static/public routes return the correct content and do not contain legacy
  Replit destinations.
- Account creation is only invoked from a supported public action and supports
  multiple selected growth paths.
- Rules tests prove unauthenticated and cross-account reads/writes are denied.
- Owner workflows are tested separately from customer workflows.
- Payment/fulfillment integration has webhook signature validation,
  idempotency, status reconciliation, and a tested failure state before live
  activation.
- The custom-domain migration has a pre-change DNS record inventory, HTTPS
  verification, and a documented rollback action.
