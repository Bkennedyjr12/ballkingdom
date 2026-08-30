# 1:1 Form — v2 consent architecture (drafting-practice upgrade)

Supplements `FORM_1ON1_REBUILD_SPEC.md`. Sections A–F there still apply; this
replaces the consent architecture with standard release-drafting structure.

**This is drafting practice, not legal advice.** Every item marked **[COUNSEL]**
is a determination only your attorney can make. California-specific points are
flagged because that is where you operate and train.

---

## 1. The single largest gap: there is no signature

The live form states it "serve[s] as documentation of a consent agreement" but
contains **no signature attestation of any kind** — no typed legal name, no
e-signature consent, no attestation of authority. A consent record with no
signature block is weak evidence of assent.

Add as the final section, all **Required**:

- `Full legal name of person completing this form` · short answer
- `I am signing this form as:` · Multiple choice
  - `The athlete (18 or older)`
  - `The parent or legal guardian of a minor athlete`
  - `An authorized agent/representative of the athlete`
- `By typing my full legal name below, I intend it to be my electronic signature, and I agree it has the same effect as a handwritten signature.` · Multiple choice (`I agree`) · Required
- `Electronic signature — type your full legal name` · short answer · Required
- Date is captured automatically by the submission timestamp. Do not ask for a self-reported date on a signed record.

## 2. Split assumption of risk from release of liability

The live form blends them. Standard practice keeps them as separate,
separately-acknowledged concepts, because they do different legal work and a
court may enforce one while striking the other.

**Section: "Assumption of Risk"** — description:
> Soccer training involves physical activity and carries inherent risks,
> including muscle strains, sprains, fractures, collision with other
> participants or equipment, heat illness, and other injury. These risks cannot
> be eliminated regardless of the care taken.

- `I understand and voluntarily accept these inherent risks.` · radio · Required
  - `I understand and accept these risks` / `I do not accept these risks`

**Section: "Release of Liability"** — see §3 for the wording.

## 3. Narrow the release — overbroad releases get struck

The live wording asks the signer to hold the organization harmless "from any
claim of injury or compensation," and the media clause has them "waive any right
to sue." **[COUNSEL]** Under California Civil Code §1668, a contract exempting
someone from responsibility for their own fraud, willful injury, or violation of
law is against public policy. A release drafted to cover "any claim" invites the
argument that it is void as overbroad. Narrowing it is what makes it more
likely to hold, not less.

Replace with a release limited to ordinary negligence, with express carve-outs:

> I release The Ballers Kingdom and its owners, staff, and coaches from claims
> arising from the **ordinary negligence** of the released parties in connection
> with training sessions.
>
> This release does **not** apply to gross negligence, recklessness, willful or
> intentional misconduct, or any liability that cannot be released under
> California law. Nothing in this form limits any right that cannot lawfully be
> waived.

- `I have read and agree to the Release of Liability above.` · radio · Required
  - `I agree` / `I do not agree`

## 4. Conspicuousness — currently actively undermined

**[COUNSEL]**, but the practice is settled: a release must be conspicuous, and
courts look unfavourably on ones buried among unrelated content. The live form
places the Risk Awareness Agreement in the same visual block as a *"Leave us a
Google Review"* prompt and pricing tiers (`L1: 6 figure session` … `L5`). That
placement is an argument against enforceability, and it is free to fix.

- Put Assumption of Risk, Release of Liability, and Media Consent each in their
  **own titled section**, on their **own page** (Forms section break).
- Remove the review prompt and the session-tier options from those sections
  entirely. A review request does not belong anywhere near a release.
- Fix `political science protection` → `legal protection`.

## 5. Minors — do not have a guardian purport to waive the child's claims

**[COUNSEL] — this is the highest-risk item in the form.** The live form
collects `Athlete Birth Date`, so minors are plainly in scope, yet the consent
is written as though one adult signer can waive everything.

California treatment of a parent's pre-injury release of a **minor's own**
future claims is contested and context-dependent. Do not rely on one. Standard
practice for a youth-sports intake is a guardian package of three distinct
things, which is materially stronger than a bare waiver:

Section "Parent / Guardian" (reached when `athlete under 18 = Yes`) — all Required:
- `Parent/Guardian full legal name`
- `Relationship to athlete`
- `Parent/Guardian email` (validated) and `phone`
- `I confirm I am the parent or legal guardian with authority to enroll this athlete.` · radio · Required
- `I have explained the risks described above to the athlete.` · radio · Required
- `In my own capacity, I assume the inherent risks of participation and agree to indemnify The Ballers Kingdom for claims I personally bring arising from ordinary negligence.` · radio · Required — **[COUNSEL] on wording and enforceability**
- `I authorize emergency medical care for the athlete if I cannot be reached, and I understand I am responsible for the cost of that care.` · radio · Required

Explicitly state in the section description that the guardian signs in their own
capacity and that the form does not purport to waive the minor's own claims.

## 6. Media / NIL — unbundle, scope, and make it optional

Two fixes, both standard practice:

**Optional, and not a condition of service.** Consent bundled into a mandatory
flow is weak consent, and weaker still for a minor. State it plainly:
> Media consent is optional. Declining will not affect your ability to train
> with us.

**Scope the grant.** The live clause is an unbounded grant for "Publication,
public relations, webpages and/or story sharing" with a waiver of the right to
sue. For an athlete-facing business this is name/image/likeness territory and
should be bounded **[COUNSEL]**:

- **Media** — photograph, video, audio recording
- **Permitted uses** — instruction and assessment, social media, website, and promotional material for The Ballers Kingdom
- **Excluded** — sale or licensing to third parties, or transfer to another business, without separate written permission
- **Territory / duration** — worldwide, for the duration of the athlete's engagement plus a stated tail **[COUNSEL]**
- **Compensation** — state expressly that no compensation is due for these uses
- **Withdrawal** — `You may withdraw media consent at any time by emailing info@ballkingdom.com. We will stop future use within 30 days. Material already printed or published may not be fully retrievable.`

Drop "waives any right to sue" from the media clause. Permission to record and a
waiver of legal remedy are different instruments; bundling them weakens both.

- `Media consent` · radio · Required to answer, either way
  - `I consent to the media uses described above`
  - `I do not consent`

## 7. Standard closing terms

One short section, description only, no question:
> This agreement is governed by the laws of the State of California. If any
> provision is found unenforceable, the remainder stays in effect. This form is
> the complete agreement about the topics it covers.

**[COUNSEL]** on governing law, venue, and whether you want any dispute-
resolution term. Do not add an arbitration clause without your attorney — a
badly drafted one is worse than none.

## 8. Privacy — you are collecting minors' health data

Beyond the notice in the base spec, practice for this data class:
> We collect emergency and health information only to run sessions safely and
> respond to an emergency. We do not sell or share your information. We keep it
> while the athlete trains with us and for a limited period afterward, then
> delete it. To access, correct, or delete your information, email
> info@ballkingdom.com.

**[COUNSEL]** on retention period and on whether any California privacy statute
applies at your size.

---

## Order of application

Sections must exist before branching can target them:
1. Add the new sections (Assumption of Risk, Release, Emergency, Health, Guardian, Media, Privacy, Signature).
2. Convert the consent questions to Required radio.
3. Delete the review prompt / session tiers from the consent area; fix the typo; delete `Option 8` and `Today's Date`.
4. Add the `under 18` branch to the Guardian section.
5. Add the top-level `What are you booking?` routing.
6. Signature section last, so it follows everything it attests to.

## What I will not claim

I am not your attorney and this is not legal advice. This structure follows
common release-drafting practice and is designed to be **stronger and more
defensible** than what is live today — narrower release, conspicuous placement,
separated concepts, real signature, unbundled optional media consent, and a
guardian package instead of a bare minor waiver. Every **[COUNSEL]** item, and
the final wording of the release, the media grant, and all minor handling,
requires sign-off from a California attorney before you should rely on it. That
gate is already open on the booking release checklist.
