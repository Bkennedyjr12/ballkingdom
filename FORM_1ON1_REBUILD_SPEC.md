# The Ballers Kingdom 1:1 Form — authoritative rebuild spec

**Target (edit in place):** `1UOj2qq-rUAsBSQDzSLI62MvE1SxG8fDbEthqF37I8ek`
**Rollback snapshot (pre-change copy):** `1VqooClha7M4EcRgDYB_Y4kEhFJ5w1N_gukBM2p1Vpc0`
**Date:** 2026-08-21
**Edit in place — deliberately.** Preserves the live form URL already published on
Calendly, the Canva welcome letter, and bkjr12.com, plus the existing response
history. A replacement form would break every shared link and orphan prior data.

## Why each change

The live form has three classes of defect: consent that cannot be proven,
required safety data that is never collected, and copy defects.

---

## A. Critical — make consent provable

The live form presents the affirmative and the negative as separately
selectable options in the same group, with the instruction "check the agree box
for both categories." A respondent can select both, select only the negative, or
select neither, and still submit. A stored response therefore is not evidence
that consent was granted — which also means prior responses cannot be migrated
as prior consent.

**Keep both choices.** Removing "do not agree" would make the consent coerced
and arguably worthless. The fix is structural: exactly one answer, mandatory.

### A1. Replace the "Risk Awareness Agreement" checkbox group

Delete the single 4-option checkbox group. Replace with **two separate
multiple-choice (radio) questions, both Required**:

**Q — Hold harmless** · type: Multiple choice · **Required**
> I have read the Risk Awareness Agreement above.
- `I AGREE to hold The Ballers Kingdom harmless from any claim of injury or compensation resulting from the activities authorized by this Consent.`
- `I DO NOT AGREE to hold The Ballers Kingdom harmless.`

**Q — Assumption of risk** · type: Multiple choice · **Required**
> Participation in soccer training carries inherent risk of injury.
- `I AGREE to take part in the growth session with the risks present.`
- `I DO NOT AGREE to take part with the risks present.`

### A2. Media consent → required radio

**Q — Content promotion consent** · type: Multiple choice · **Required**
- `I CONSENT to the photograph and audio use described above.`
- `I DO NOT CONSENT.`

Add below it, as a non-required short-answer:
> If you do not consent, tell us anything we should know (optional).

### A3. Media consent must be withdrawable and unbundled

Two substantive problems with the current media clause, both for the attorney
gate, not for me to settle:

1. It bundles permission-to-record with **"Agrees to waives any right to sue for
   use of the photographs/audio recordings."** A waiver of legal remedy is a
   materially different thing from permission to film, and bundling them into one
   checkbox weakens both.
2. There is **no withdrawal path**, even though images of minors may be
   published to "webpages and/or story sharing."

Recommended interim copy addition (subject to attorney approval):
> You may withdraw media consent at any time by emailing info@ballkingdom.com.
> Withdrawal stops future use. Material already published may not be fully
> retrievable.

---

## B. Missing required safety and policy data

None of the following exists on the live form. The first two are the serious
gap: this form books in-person physical training, collects Athlete Birth Date,
and has no way to reach anyone in an emergency.

### B1. New section: "Emergency Contact" — all Required
- `Emergency Contact Name (First & Last)` · short answer · Required
- `Relationship to Athlete` · short answer · Required
- `Emergency Contact Phone` · short answer · Required
- `Alternate Phone` · short answer · optional

### B2. New section: "Health & Safety" — Required where noted
- `Does the athlete have any medical conditions, injuries, or allergies we should know about?` · Multiple choice (`Yes` / `No`) · **Required**
- `If yes, please describe (condition, injury, allergy, and any limitation).` · paragraph · optional
- `Medications taken during training, if any` · short answer · optional
- `Does the athlete carry an inhaler, EpiPen, or other emergency medication?` · Multiple choice (`Yes` / `No`) · **Required**
- `I authorize The Ballers Kingdom to seek emergency medical assistance if needed and understand I am responsible for the cost of that care.` · Multiple choice (`I authorize` / `I do not authorize`) · **Required**

### B3. Minor / guardian path — currently implicit only

The live form collects `Athlete Birth Date` and mentions an "Agent /
Representative" and a "responsible adult," but has no age gate, no explicit
guardian identification, and no guardian attestation distinct from the athlete.

- `Is the athlete under 18 years of age?` · Multiple choice (`Yes` / `No`) · **Required**
  - Route `Yes` → section "Parent / Guardian" (Forms section branching)
- Section "Parent / Guardian" — all Required when reached:
  - `Parent/Guardian Full Name`
  - `Relationship to Athlete`
  - `Parent/Guardian Email`
  - `Parent/Guardian Phone`
  - `I am the parent or legal guardian of the athlete named above, and I am agreeing to this form on their behalf.` · Multiple choice (`I confirm` / `I do not confirm`) · **Required**

### B4. Cancellation policy — Required acknowledgment
Section description:
> Sessions cancelled with less than 24 hours' notice may be charged in full.
> Package credits are not refundable but may be rescheduled subject to
> availability.

- `I understand the 24-hour cancellation policy.` · Multiple choice (`I understand` / `I do not agree`) · **Required**

### B5. Privacy and retention notice — Required acknowledgment
Section description:
> We collect this information to plan sessions, keep in touch, and respond in an
> emergency. We keep it only as long as needed for that purpose. You may request
> access, correction, or deletion at any time by emailing info@ballkingdom.com.
> We do not sell your information.

- `I have read the privacy notice.` · Multiple choice (`I have read it` / `I have questions`) · **Required**

---

## C. Copy and hygiene defects

| Location | Current | Change to |
| --- | --- | --- |
| Google Review section description | `For all parties political science protection` | `For all parties' legal protection` |
| 1-on-1 preferred time options | `Option 8` (leftover placeholder) | delete the option |
| Form/section headers | `BKC🌐TBK🌍 Form 👑`, mixed brand/emoji header block, podcast + logistics + Arc Hub links | Move the multi-brand link wall out of the intake header into the closing section. An intake form that opens with six unrelated business links buries the task. |
| Google Review section | `L1: 6 figure session` … `L5: 10 figure session` mixed into a review prompt | Separate these. Session tiers are not a review question; either make them a labelled "Session tier" question or remove them from the review block. |
| Group questions | Group day/time/commitment questions live inside the form titled "1:1" | Either rename the form to reflect that it handles 1:1, group, and pick-up, or branch by "What are you booking?" at the top. Current naming does not match behaviour, and the separate Group Form is unpublished. |

### C1. Recommended top-level routing
Add as the first question, **Required**:
- `What are you booking?` · Multiple choice
  - `1:1 training` → 1:1 section
  - `Group training` → group section
  - `Pick-up / hybrid session` → pick-up section

That removes the "*Any questions that don't apply, please input N/A*" instruction,
which currently exists only because everyone sees every question.

---

## D. Field-level fixes to existing questions

- `Athlete Name (First & Last)` → **Required** (currently not)
- `Email Address:` → **Required**, and set response validation to email format
- `Phone Number` → **Required**
- `Athlete Birth Date` → **Required** (it drives the minor branch)
- `Contact Information (Phone Number, Email Address, Instagram)` → **delete**. It duplicates the dedicated email and phone questions and invites inconsistent data. Keep a separate optional `Instagram handle` if wanted.
- `Today's Date` → **delete**. Google Forms records a submission timestamp automatically; a self-reported date is a data-integrity risk on a consent record.

---

## E. Application

Two viable paths. **The API path is recommended** — it is atomic per
`batchUpdate`, reviewable as JSON, and does not depend on clicking a
re-rendering editor.

### E1. Forms API (recommended)
Requires one interactive step that only you can perform, because it needs a
consent screen as `lilpelejr12@gmail.com`:

```
gcloud auth login                     # sign in as lilpelejr12@gmail.com
gcloud config set project the-ballers-kingdom
gcloud services enable forms.googleapis.com
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/forms.body,https://www.googleapis.com/auth/cloud-platform
```

Once that returns, I can read the form as JSON, apply this spec as a reviewed
`batchUpdate`, and read it back to verify — no UI clicking.

### E2. Manual application in the editor
This spec is written to be applied top to bottom by hand. Order matters: add the
new sections before adding branching, because branch targets must exist first.

### Rollback
`1VqooClha7M4EcRgDYB_Y4kEhFJ5w1N_gukBM2p1Vpc0` is a full pre-change copy taken
2026-08-21 before any edit. Nothing has been changed on the live form yet.

---

## F. Limits

This is a data-collection and consent-structure design, **not legal advice**.
The hold-harmless wording, the media sue-waiver, the emergency-care cost
authorization, and all minor/guardian handling need attorney review before they
can be relied on — that gate is already open on the booking release checklist
and this form should be inside its scope, since it is live today.
