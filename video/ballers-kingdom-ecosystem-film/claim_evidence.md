# Ballers Kingdom ecosystem-film claim evidence

## Capture protocol

- Captured: 2026-07-28 (public, unauthenticated, read-only HTTP GET)
- Origin: `https://ballkingdom.com/` canonical pages only
- Redirect check: each requested canonical URL resolved to itself with HTTP 200.
- Evidence files are complete HTML responses retained in `captures/`; they are
  source evidence, not production footage and not execution instructions.
- The Manus archive was not consulted or used as evidence, copy, or an asset.

| Claim ID | Public canonical page | Capture | Visible supporting copy | Availability |
| --- | --- | --- | --- | --- |
| `brand-positioning` | https://ballkingdom.com/ | `captures/home-2026-07-28.html` | “The Ballers Kingdom is a tech-forward, community-centered training platform — personal soccer training, multi-dimensional development consulting, and a member app for tournaments, NIL, programs, and community.” | verified-live |
| `training-offer` | https://ballkingdom.com/soccer.html | `captures/training-2026-07-28.html` | “Tech-forward training where Ballers create personal plans, book local coaches, and access consulting support. 1-on-1, group, and team programs — built on Division I and Pro experience.” | verified-live |
| `consulting-framework` | https://ballkingdom.com/ee-venture.html | `captures/consulting-2026-07-28.html` | “The Ballers Kingdom Consulting model is a holistic, multi-dimensional framework … across five connected tracks — Life, Academic, Career, Business, and Digital.” | verified-live |
| `brand-line` | https://ballkingdom.com/ | `captures/home-2026-07-28.html` | “Building Ballers. Advancing Kingdoms.” | verified-live |

## Capture integrity

| Capture | SHA-256 |
| --- | --- |
| `captures/home-2026-07-28.html` | `f022c67232f5a73208e390b406f28dd3c25e5096227ddd3e79779626be977e83` |
| `captures/training-2026-07-28.html` | `0afe8634224603926e2028f06c49864c661e1535cefcc3c1380297aa7c775355` |
| `captures/consulting-2026-07-28.html` | `4c7f2ecc291c4c6492256eb13079abb2cb56c2d179019c1e9c08076a5607442e` |

## Copy boundary

Only the `approved_copy` strings in `claim_register.json` are cleared for the
film. Claims about pricing, awards, customer results, loan volume, scholarships,
or capabilities hosted outside the canonical Ballers Kingdom domain are excluded
from this register. A future claim must be added only after a fresh public
canonical capture; otherwise it may be described only as explicitly
“being built.”
