# Ballers Kingdom ecosystem-film visual audit

**Artifact:** `ecosystem-animatic.mp4`
**Classification:** local review animatic only — not a public or final master.
**Contract:** 70 seconds, 1920×1080, 24 fps, 16:9, H.264/AAC.

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
- Captions remain 42px at 1080p, centered in the lower safe area, no more than four lines, and must not obscure Brian's face or a material soccer action.
- The last six seconds must retain an audible local music/room-tone bed to avoid a dead-air tail.

## Frame-review record

The renderer extracts `review-frames/{1,8,15,17,25,33,35,45,55,57,62,68}s.png`: opening, middle, and ending frames for foundation; whole-person promise; verified paths; and the combined community/CTA chapter. Review each file after render and replace/reject any source that fails a mandatory check before external review.

## Rejected assets

| Asset | Reason | Disposition |
| --- | --- | --- |
| `pexels-18450900.mp4` | American-football footage; prohibited by the source register | Excluded |
| `pexels-7187047.mp4` | Close ball view makes a third-party ball mark potentially legible | Excluded from this animatic |
| `pexels-6077711.mp4` | Coach/player apparel marks cannot be safely cleared in the selected wide field frame | Excluded from this animatic |

## Voice availability

The Task 2 generator is pinned to the authorized local Chatterbox runtime. Its attempted local generation failed before WAV validation because that runtime lacked the local `perth` module. No fallback runtime, cloud provider, or substitute voice is allowed. Therefore the first review render must be explicitly music-only until the pinned runtime can generate a valid 70-second authorized master.
