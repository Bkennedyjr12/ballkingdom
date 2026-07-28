# Ballers Kingdom ecosystem-film visual audit

**Artifact:** `ecosystem-animatic.mp4`
**Classification:** local review animatic only — not a public or final master.
**Contract:** 70 seconds, 1920×1080, 24 fps, 16:9, H.264/AAC.

> **Round-1 regeneration gate (2026-07-28):** The previously rendered local
> MP4 is superseded for voiced review. A fresh render may mix narration only
> after `validate_authorized_narration.py` verifies the generated
> `authorized-clone-manifest.json`: locked-contract hash, authorized Brian
> reference ID/hash, pinned Chatterbox runtime hash, synthesis-script hash,
> every per-beat WAV hash/duration, and master hash/duration. The local
> machine's fresh clone attempt was stopped before its first WAV completed
> because one sampling step took 74 seconds; no substitute, recovered clip, or
> fabricated manifest was used. Regenerate and rerender before external review.

## Source and claim audit

| Beat | Source | Visual purpose | Permitted claim IDs | Copy treatment | Review result |
| --- | --- | --- | --- | --- | --- |
| `foundation` | Approved Brian adult-coach anchor | Founder-manifesto continuity | None | SRT generated from contract; chapter label composited in post | Pass — soccer field context; no mark or synthetic alteration visible |
| `whole-person-promise` | Approved Brian adult-coach anchor | Whole-person practice context | `consulting-framework` | Exact contract SRT; no simulated app or dashboard | Pass after safe-area correction — no fake UI or added claim |
| `verified-paths` | Registered `pexels-6084027` generic soccer stock | Training-energy cutaway only; never represented as Ballers participation | `brand-positioning`, `training-offer` | Exact contract SRT; no fabricated product UI | Pass as generic soccer only; uniform numerals are not treated as an affiliation or claim |
| `community` | Registered `pexels-6084027` generic soccer stock | Generic community-energy cutaway only | None | Exact contract SRT | Pass — soccer cones and training action only; no participation claim |
| `cta` | Approved Brian adult-coach anchor | Deliberate final hold | None | CTA read from contract and composited in post | Pass after duplicate-CTA removal — locked URL only |

## Mandatory rejection checks

- Soccer only: no American-football footage; the previously rejected `pexels-18450900.mp4` is absent.
- No third-party logos/brands, readable uniform/apparel marks, or unaudited footage. The generic-stock crop is rejected if a mark becomes legible.
- No representation of stock subjects as Ballers Kingdom customers, participants, events, coaches, or endorsements.
- No generated people, anatomy, fake UI, fake copy, fake metrics, invented booking offer, or substituted URL.
- All visible wording is composited after footage selection: contract-generated captions plus `render_graphics.mjs` overlays.
- Captions are one contract sentence/phrase at a time, manifest-timed to the
  synthesized speech span, 42px at 1080p, maximum three lines, and must not
  obscure Brian's face or a material soccer action.
- The last six seconds must retain an audible local music/room-tone bed to avoid a dead-air tail.

## Frame-review record

The renderer extracts `review-frames/{1,8,15,17,25,33,35,45,55,57,62,68}s.png`: opening, middle, and ending frames for foundation; whole-person promise; verified paths; and the combined community/CTA chapter. Review each file after render and replace/reject any source that fails a mandatory check before external review.

## Rejected assets

| Asset | Reason | Disposition |
| --- | --- | --- |
| `pexels-18450900.mp4` | American-football footage; prohibited by the source register | Excluded |
| `pexels-7187047.mp4` | Close ball view makes a third-party ball mark potentially legible | Excluded from this animatic |
| `pexels-6077711.mp4` | Coach/player apparel marks cannot be safely cleared in the selected wide field frame | Excluded from this animatic |

## Voice, caption, and final-review gate

The Task 2 generator is pinned to the authorized local Chatterbox runtime and
authorized Brian reference. The renderer now rejects a narration WAV without
the provenance manifest above; it never treats container/duration alone as
authorization. Phrase cue timings are generated from measured per-beat
durations, validated against the locked phrase copy, and composited
post-production only at their individual intervals. After a successful fresh
generation, review the voiced master perceptually against the locked script:
each phrase begins/ends with its audible speech, claim wording is exact, and
the CTA remains audible over the final six seconds. Record master/manifest
hashes, frame review, and tail-audio results here before handoff.
