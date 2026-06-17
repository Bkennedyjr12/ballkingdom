// The Ballers Kingdom — Readiness Scorecard data
// Integrated business-readiness diagnostic across three domains:
//   1) Capital Readiness        (SBA 7(a)/504, lender 5 C's)
//   2) Contract / Procurement   (gov + commercial contracting readiness)
//   3) Continuity / Exit        (succession, transferable value, exit)
//
// Built on best-in-class frameworks: SBA/lender 5 C's of credit,
// SBA/GSA/APEX procurement standards, and Value-Builder-style exit/
// transferable-value principles. Each question's options are ordered
// worst -> best and scored 0..4. Educational, not financial/legal advice.

window.READINESS_DATA = {
  domains: [
    {
      id: 'capital',
      name: 'Capital Readiness',
      tag: 'Capital',
      blurb: 'How ready you are to access SBA & lender capital to buy buildings, equipment, or businesses.',
      questions: [
        { q: 'Do you know your business and personal credit position (FICO, Dun & Bradstreet, Experian Business)?',
          opts: ['No idea where either stands', 'Vaguely \u2014 never really checked', 'Checked once, don\u2019t track it', 'Know both numbers', 'Know both and actively manage/build them'] },
        { q: 'How clean and current are your financials (P&L, balance sheet, tax returns)?',
          opts: ['No formal books', 'Spreadsheet only, often behind', 'Bookkeeping software, sometimes behind', 'Current monthly statements', 'Current statements + 2\u20133 years of filed returns ready for a lender'] },
        { q: 'Could you show enough cash flow to service new debt (debt-service coverage)?',
          opts: ['Not sure what that means', 'Cash flow is tight/negative', 'Roughly break-even', 'Positive, could cover some debt', 'Strong, documented coverage above 1.25x'] },
        { q: 'Do you understand how SBA 7(a) vs 504 financing could fund your growth (acquisition, real estate, equipment)?',
          opts: ['Never heard the difference', 'Heard of SBA, unclear how', 'Know one of them', 'Know both at a high level', 'Know which fits buying a building, equipment, or a business'] },
        { q: 'Do you have a documented use-of-funds and a 3\u20135 year growth plan a lender could review?',
          opts: ['None', 'It\u2019s in my head', 'Rough notes', 'Written plan, not lender-ready', 'Lender-ready plan tied to specific assets and projections'] },
        { q: 'How is your equity / down-payment and collateral position for a major purchase?',
          opts: ['No injection or collateral available', 'Minimal', 'Some savings or assets', 'Meaningful injection ready', 'Strong injection + collateral identified'] }
      ]
    },
    {
      id: 'contract',
      name: 'Contract / Procurement Readiness',
      tag: 'Contracts',
      blurb: 'How ready you are to win and deliver government and commercial contracts.',
      questions: [
        { q: 'Is your business formally registered and eligible to contract (entity, EIN, SAM.gov / licenses)?',
          opts: ['Not formally set up', 'Entity only', 'Entity + EIN', 'Registered + licenses current', 'Fully registered incl. SAM.gov / required certs'] },
        { q: 'Do you have relevant certifications (small business, 8(a), WOSB, MBE/DBE, industry)?',
          opts: ['None and unsure which apply', 'Know some might apply', 'Started one application', 'Hold one certification', 'Hold the certifications that fit my market'] },
        { q: 'Do you have a capability statement and past-performance record buyers can review?',
          opts: ['Neither', 'Informal portfolio', 'Basic capability statement', 'Polished capability statement', 'Capability statement + documented past performance/references'] },
        { q: 'How well do you understand the contracts you sign (scope, terms, risk, payment)?',
          opts: ['I sign without reading closely', 'Skim them', 'Read but unsure on risk terms', 'Read and flag key terms', 'Review systematically and negotiate terms / use counsel'] },
        { q: 'Do you have the capacity (cash, staff, systems) to actually deliver if you win?',
          opts: ['No \u2014 winning would break us', 'Doubtful', 'Maybe for small awards', 'Yes for moderate awards', 'Yes, with bonding/financing/staffing planned to scale'] },
        { q: 'Do you actively pipeline opportunities (gov + commercial) and respond to bids/RFPs?',
          opts: ['Never bid', 'Bid once or twice', 'Occasionally', 'Bid regularly', 'Systematic pipeline + win/loss tracking'] }
      ]
    },
    {
      id: 'exit',
      name: 'Continuity / Exit Readiness',
      tag: 'Exit',
      blurb: 'How transferable and protected your business value is \u2014 succession, continuity, and exit.',
      questions: [
        { q: 'How dependent is the business on you personally (owner dependence)?',
          opts: ['Nothing runs without me', 'Most things need me', 'Key decisions need me', 'Runs week-to-week without me', 'Runs without me \u2014 strong team + systems'] },
        { q: 'Are your core processes documented (SOPs) so someone else could run them?',
          opts: ['Nothing documented', 'A few notes', 'Some key processes', 'Most processes documented', 'Documented, trained, and followed'] },
        { q: 'How diversified is your revenue (customer / contract concentration)?',
          opts: ['One client is most revenue', 'Top client > 50%', 'Top client 25\u201350%', 'Reasonably spread', 'Well diversified, recurring revenue'] },
        { q: 'Do you have a written succession or continuity plan (death, disability, exit)?',
          opts: ['None', 'Thought about it', 'Informal understanding', 'Drafted plan', 'Documented, funded, and reviewed plan'] },
        { q: 'Do you know what your business is worth and what drives that value?',
          opts: ['No idea', 'A guess', 'Rough multiple in mind', 'Had an informal valuation', 'Formal valuation + value-driver plan'] },
        { q: 'Are the legal/financial foundations of transfer in place (clean cap table, agreements, records)?',
          opts: ['Messy or unknown', 'Some gaps', 'Mostly there', 'In place, not reviewed recently', 'Clean, current, and deal-ready'] }
      ]
    }
  ],

  // Grade bands on overall 0..100.
  grades: [
    { min: 85, grade: 'A', color: '#15803D', stage: 'Deal-Ready', desc: 'You\u2019re positioned to act \u2014 access capital, pursue contracts, and protect or transfer value. The work now is optimization and timing. This is where the wealth transfer window rewards the prepared.' },
    { min: 70, grade: 'B', color: '#2563EB', stage: 'Building Momentum', desc: 'Strong foundation with clear gaps to close. With focused work over a quarter or two, you can move into deal-ready territory across all three domains.' },
    { min: 50, grade: 'C', color: '#CA8A04', stage: 'Foundational', desc: 'The pieces are forming but not yet aligned. You have real opportunity \u2014 the priority is tightening financials, formalizing the business, and reducing dependence on you.' },
    { min: 0,  grade: 'D', color: '#DC2626', stage: 'Early Stage', desc: 'You\u2019re at the starting line on readiness \u2014 which is exactly the right time to build the right way. Small, ordered steps now prevent expensive problems later.' }
  ],

  // Pool of action steps; the engine selects/orders ~12 by weakest areas.
  // Each maps to a domain and a recommended next step.
  playbook: {
    capital: [
      { t: 'Pull all three credit reports', d: 'Check personal FICO + business credit (D&B, Experian Business). Dispute errors and start a 90-day improvement plan.' },
      { t: 'Get your books lender-ready', d: 'Bring bookkeeping current and produce clean monthly P&L and balance sheet. Lenders fund clarity.' },
      { t: 'Calculate your debt-service coverage', d: 'Know whether your cash flow can support new debt (target 1.25x+). This is the number lenders lead with.' },
      { t: 'Map SBA 7(a) vs 504 to your goal', d: 'Buying a building or major equipment leans 504; acquiring a business or working capital leans 7(a). Know which fits your move.' },
      { t: 'Write a lender-ready use-of-funds', d: 'Document exactly what you\u2019d buy, why, and the projected return \u2014 tied to a 3\u20135 year plan.' },
      { t: 'Build your equity & collateral position', d: 'Line up your down-payment injection and identify collateral before you apply.' }
    ],
    contract: [
      { t: 'Complete your registrations', d: 'Lock in entity, EIN, licenses, and SAM.gov if pursuing government work. Eligibility is the gate.' },
      { t: 'Pursue the right certifications', d: 'Identify which certifications fit your market (small business, 8(a), WOSB, MBE/DBE) and start the application.' },
      { t: 'Build a capability statement', d: 'One clean page: who you are, what you do, differentiators, past performance, codes. Buyers ask for it first.' },
      { t: 'Systematize contract review', d: 'Never sign without reviewing scope, payment terms, and risk. Build a checklist or use counsel on material deals.' },
      { t: 'Pressure-test delivery capacity', d: 'Before you bid, confirm you can deliver \u2014 cash, staff, bonding. Winning what you can\u2019t deliver is a trap.' },
      { t: 'Build a bid pipeline', d: 'Track gov + commercial opportunities and respond consistently. Track win/loss to improve.' }
    ],
    exit: [
      { t: 'Reduce owner dependence', d: 'List everything only you can do and start delegating or documenting it. Transferable businesses run without the owner.' },
      { t: 'Document your core SOPs', d: 'Write down how the key work gets done so the business is a system, not just you.' },
      { t: 'Diversify your revenue', d: 'Reduce customer/contract concentration so no single loss can sink the business \u2014 buyers and lenders both reward this.' },
      { t: 'Draft a continuity & succession plan', d: 'Plan for death, disability, and exit now. Fund it (e.g., agreements + insurance) before you need it.' },
      { t: 'Get a baseline valuation', d: 'Know what your business is worth and which value drivers to improve. You can\u2019t grow a number you don\u2019t track.' },
      { t: 'Clean up the legal/financial foundation', d: 'Tidy your cap table, agreements, and records so the business is deal-ready when opportunity comes.' }
    ]
  },

  booking: 'contact.html'
};
