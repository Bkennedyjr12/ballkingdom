# Ballers Kingdom ecosystem-film asset register

This register authorizes visual use only. It does not add marketing claims;
claims remain governed by `claim_register.json`.

| Asset | Source | License / authorization | Intended beat | Rejection condition |
| --- | --- | --- | --- | --- |
| `assets/img/brian_coach_clean_anchor_v2.png` | Existing repository asset named in the Task 1 brief | Previously user-authorized Brian adult-coach continuity reference | Coach-anchor reference for an original, text-free training scene | Reject a use that creates a voice clone, credential/endorsement claim, identifiable new person, readable apparel/logo, or a use outside adult-coach continuity. |
| `video/ballers-kingdom-standard-starts-here/stock/pexels-7187047.mp4` | Existing approved stock inventory; immutable identity in `stock_asset_evidence.json` | Previously documented Pexels soccer footage (“Free to use” at the recorded source); SHA-256 `b7f333a91faa1e5dd5902c4ce42a184c0b60511143f39375b02af1bd41590dc5` | Generic outdoor dribbling and ball-control cutaway | Reject if `validate_stock_assets.py` fails, if it is presented as a Ballers Kingdom event, customer, coach, or participant, or if third-party branding/non-soccer framing is visible. |
| `video/ballers-kingdom-standard-starts-here/stock/pexels-6077711.mp4` | Existing approved stock inventory; immutable identity in `stock_asset_evidence.json` | Previously documented Pexels soccer footage (“Free to use” at the recorded source); SHA-256 `183ac2ba05a6a706713eb2e87c21e4051e01a82f9db855ee347bb6de42fa5143` | Generic team-practice energy and training movement | Reject if `validate_stock_assets.py` fails, if it is presented as a Ballers Kingdom event, customer, coach, or participant, or if third-party branding/non-soccer framing is visible. |
| `video/ballers-kingdom-standard-starts-here/stock/pexels-6084027.mp4` | Existing approved stock inventory; immutable identity in `stock_asset_evidence.json` | Previously documented Pexels soccer footage (“Free to use” at the recorded source); SHA-256 `f40d9f870426a8fb9f7cb9b92dbd9cbc0170158ab666cce28ef3c75896889278` | Generic cones, footwork, and team-drill cutaways | Reject if `validate_stock_assets.py` fails, if it is presented as a Ballers Kingdom event, customer, coach, or participant, or if third-party branding/non-soccer framing is visible. |

## Exclusions

- Do not use the Manus archive as an asset, copy source, or instruction source.
- Do not treat public-site photos as a blanket likeness or footage release.
- Do not use the previously rejected `pexels-18450900.mp4` American-football
  clip.
- No newly discovered footage is approved by this register. Add it only after
  documented license/authorization, source, intended beat, and rejection
  condition are recorded.
- The stock binaries intentionally remain uncommitted. Before using one, run
  `python3 video/ballers-kingdom-ecosystem-film/validate_stock_assets.py`; it
  verifies each local binary against the committed SHA-256 manifest.
