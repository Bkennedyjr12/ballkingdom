import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const guideRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const assetsDir = path.join(guideRoot, 'public', 'assets');
const outPath = path.join(assetsDir, 'homeowner-freebie.pdf');

const ROYAL = rgb(0.106, 0.227, 0.557);
const NAVY = rgb(0.043, 0.071, 0.125);
const INK = rgb(0.102, 0.122, 0.18);
const MUTED = rgb(0.392, 0.408, 0.471);
const LIGHT = rgb(0.898, 0.906, 0.922);

async function main(){
  await fs.mkdir(assetsDir, {recursive:true});
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const W = 612, H = 792;
  const margin = 48;

  function addPage(){
    return pdf.addPage([W,H]);
  }
  function drawText(page, text, x, y, size, f, color, maxW){
    page.drawText(text, {x, y, size, font:f, color, maxWidth: maxW});
  }
  function wrap(page, text, x, y, size, f, color, maxW, lineGap){
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for(const w of words){
      const t = line ? line+' '+w : w;
      if(f.widthOfTextAtSize(t, size) > maxW){
        drawText(page, line, x, yy, size, f, color);
        yy -= lineGap;
        line = w;
      } else line = t;
    }
    if(line) drawText(page, line, x, yy, size, f, color);
    return yy - lineGap;
  }

  // COVER
  {
    const p = addPage();
    p.drawRectangle({x:0,y:0,width:W,height:H, color: NAVY});
    // BK badge
    p.drawCircle({x:W/2, y:520, size:52, color: rgb(1,1,1), borderColor: ROYAL, borderWidth: 2.5, opacity:1, borderOpacity:1});
    // inner circle
    p.drawCircle({x:W/2, y:520, size:36, color: ROYAL});
    // BK & EST 2019 inside - approximate with text
    drawText(p, 'BK', W/2 - bold.widthOfTextAtSize('BK',22)/2, 528, 22, bold, rgb(1,1,1));
    drawText(p, 'EST 2019', W/2 - font.widthOfTextAtSize('EST 2019',6)/2, 508, 6, font, rgb(0.75,0.78,0.84));
    drawText(p, 'THE BALLERS KINGDOM', W/2 - font.widthOfTextAtSize('THE BALLERS KINGDOM',8)/2, 470, 8, font, rgb(0.75,0.78,0.84));
    drawText(p, 'EST 2019  ·  BALLERS KINGDOM HOME INSPECTIONS', W/2 - bold.widthOfTextAtSize('FREE HOMEOWNER\'S',28)/2+4, 420, 9, bold, rgb(1,1,1));
    // title
    const t1 = "FREE HOMEOWNER'S";
    const t2 = "INSPECTION GUIDE";
    drawText(p, t1, W/2 - bold.widthOfTextAtSize(t1,34)/2, 390, 34, bold, rgb(1,1,1));
    drawText(p, t2, W/2 - bold.widthOfTextAtSize(t2,34)/2, 352, 34, bold, rgb(1,1,1));
    drawText(p, 'A premium takeaway for clients — what we inspect,', W/2 - font.widthOfTextAtSize('A premium takeaway for clients — what we inspect,',10)/2, 318, 10, font, rgb(0.85,0.88,0.92));
    drawText(p, 'what is not included, limitations, and next steps.', W/2 - font.widthOfTextAtSize('what is not included, limitations, and next steps.',10)/2, 304, 10, font, rgb(0.85,0.88,0.92));
    drawText(p, 'ballkingdom.com  ·  Inland Empire, California', W/2 - font.widthOfTextAtSize('ballkingdom.com  ·  Inland Empire, California',8)/2, 240, 8, font, rgb(0.65,0.70,0.80));
    drawText(p, 'Page 1 of 12', W - margin - font.widthOfTextAtSize('Page 1 of 12',7), 34, 7, font, rgb(0.6,0.65,0.75));
  }

  // PAGE 2 - Why this guide
  {
    const p = addPage();
    p.drawRectangle({x:0,y:H-72,width:W,height:72, color: NAVY});
    drawText(p, 'THE BALLERS KINGDOM  —  EST 2019', margin, H-38, 7, bold, rgb(1,1,1));
    drawText(p, 'Free Homeowner’s Inspection Guide', margin, H-56, 13, bold, rgb(1,1,1));
    drawText(p, 'Page 2 of 12', W - margin - font.widthOfTextAtSize('Page 2 of 12',7), H-42, 7, font, rgb(0.8,0.82,0.88));
    let y = H-110;
    drawText(p, 'Why this guide exists', margin, y, 16, bold, NAVY); y-=8;
    p.drawLine({start:{x:margin,y:y}, end:{x:W-margin,y:y}, thickness:1.5, color: ROYAL}); y-=22;
    y = wrap(p, 'You just booked a home inspection. This leave-behind tells you exactly what we inspect, how we write it (Location -> Condition -> Implication -> Recommendation), and what happens after the report. No classroom filler — just the workflow buyers actually use.', margin, y, 9, font, INK, W-margin*2, 14);
    y-=10;
    drawText(p, 'How to use it', margin, y, 11, bold, ROYAL); y-=18;
    y = wrap(p, '1. Read the scope table (p.3) before we arrive — know what is included.  2. Follow along on inspection day with the same checklist we use.  3. After the report, use p.10–11 to prioritize: Safety -> Structure -> Moisture -> Systems.', margin, y, 8.5, font, INK, W-margin*2, 13);
    y-=12;
    drawText(p, 'What we stand on — The Three F’s', margin, y, 11, bold, ROYAL); y-=16;
    y = wrap(p, 'Faith — character shapes performance.  Family — every athlete is someone’s son or daughter first.  Furtherment — you leave better than you arrived. We inspect homes the same way.', margin, y, 8.5, font, INK, W-margin*2, 13);
    y-=16;
    p.drawRectangle({x:margin, y:y-56, width:W-margin*2, height:56, color: rgb(0.96,0.97,0.985), borderColor: LIGHT, borderWidth:1});
    drawText(p, 'Tip: This is the client-facing summary. The full field workflow', margin+10, y-18, 8, bold, NAVY);
    y = wrap(p, 'Learn -> Study -> Practice -> Inspection -> Report lives at the Inspector OS (the-ballers-kingdom.web.app/operations) with CRM, Pipeline, and guided checklists.', margin+10, y-32, 7.5, font, INK, W-margin*2-20, 11);
    drawText(p, 'Page 2 of 12', W - margin - font.widthOfTextAtSize('Page 2 of 12',7), 34, 7, font, MUTED);
  }

  // PAGE 3 - Scope by system
  {
    const p = addPage();
    p.drawRectangle({x:0,y:H-72,width:W,height:72, color: NAVY});
    drawText(p, 'SCOPE BY SYSTEM', margin, H-42, 10, bold, rgb(1,1,1));
    drawText(p, 'Page 3 of 12', W - margin - font.widthOfTextAtSize('Page 3 of 12',7), H-42, 7, font, rgb(0.8,0.82,0.88));
    let y = H-102;
    drawText(p, 'What we inspect — and what we don’t', margin, y, 13, bold, NAVY); y-=18;
    const rows = [
      ['System','Included','Not included / limitation'],
      ['Roof','Cover, drainage, flashings, penetrations','Prediction of life, invasive testing'],
      ['Exterior','Siding, trim, grading, vegetation','Boundary, soil testing'],
      ['Attic / Roof Structure','Insulation, ventilation, framing (where visible)','Engineering analysis'],
      ['Foundation / Crawl','Foundation, sills, moisture signs (visible)','Soil report, destructive probing'],
      ['Electrical','Panels, wiring (visible), outlets, GFCI/AFCI','Load calc, low-voltage'],
      ['Plumbing','Pipes (visible), fixtures, water heater, drains','Sewer scope unless added'],
      ['HVAC','Heating/cooling operation, filters, ducts (visible)','Efficiency testing'],
      ['Interiors','Walls, ceilings, floors, doors/windows, stairs','Cosmetic, code search'],
      ['Kitchens / Baths / Laundry','Counters, cabinets, plumbing, exhaust','Appliance life prediction'],
      ['Decks / Garages','Structure, attachment, rail/steps','Outbuilding scope unless booked'],
      ['Environmental','Visible screening only (mold, radon flagged)','Lab testing unless added'],
    ];
    const colW = [120, 180, 200];
    const rowH = 18;
    // header
    p.drawRectangle({x:margin,y:y-4,width:W-margin*2,height:rowH, color: ROYAL});
    let x = margin+6;
    for(let i=0;i<3;i++){ drawText(p, rows[0][i], x, y, 7, bold, rgb(1,1,1)); x+=colW[i]; }
    y -= rowH;
    for(let r=1;r<rows.length;r++){
      const bg = r%2===0 ? rgb(0.97,0.98,1) : rgb(1,1,1);
      p.drawRectangle({x:margin,y:y-4,width:W-margin*2,height:rowH, color:bg, borderColor: LIGHT, borderWidth:0.5});
      x = margin+6;
      for(let i=0;i<3;i++){ drawText(p, rows[r][i], x, y, 6.5, font, INK, colW[i]-8); x+=colW[i]; }
      y -= rowH;
    }
    drawText(p, 'Page 3 of 12', W - margin - font.widthOfTextAtSize('Page 3 of 12',7), 34, 7, font, MUTED);
  }

  // PAGES 4-9 - One per major area with write style
  const pages = [
    {title:'Roof & Exterior', key:'Location -> Condition -> Implication -> Recommendation', body:'Example: “South roof slope, asphalt shingle — granular loss and lifted tabs at ridge — accelerates wear and raises leak risk — recommend qualified roofer to repair and reassess remaining life.” Look for: missing tabs, ponding, failed flashing at valleys/chimneys, vegetation contact. Limitation: we do not predict remaining life or lift shingles invasively.'},
    {title:'Attic, Insulation & Ventilation', body:'We check insulation depth/type, ventilation (soffit/ridge/gable), and visible framing. Thin or displaced insulation = energy/moisture risk; blocked soffits = heat buildup. Example write: “Attic north bay — R-19 fiberglass, compressed at eaves — reduces thermal performance — add baffles and top-up insulation.” Safety note: we do not enter unsafe or sealed attic areas.'},
    {title:'Structure & Foundation', body:'Visible foundation walls, sills, posts, and floor framing from crawl or basement hatch. Hairline cracks vs offset/displacement matter. Moisture staining = monitor. Example: “West foundation wall, interior — vertical crack 1/8”, no displacement, dry at time of inspection — monitor for movement/moisture — recommend structural review if it widens.” No soil engineering.'},
    {title:'Electrical & Plumbing', body:'Panels/wiring visible without dismantling, outlet sampling, GFCI/AFCI where required, fixture operation. Look for: double-tapped breakers, missing GFCI at wet areas, corroded valves. Example: “Kitchen west wall — outlet within 6’ of sink lacks GFCI protection — shock hazard — add GFCI protection by electrician.” Water heater TPR, gas flex, and drain flow are checked; sewer scope is separate.'},
    {title:'HVAC, Interiors & Kitchens/Baths', body:'We operate HVAC in its season, check filters, visible ducts, and thermostat response. Interiors: walls/ceilings/floors, doors/windows, stairs/rails. Kitchens/baths: cabinets, counters, plumbing, exhaust. Example: “Master bath — exhaust fan vents to attic, not exterior — traps moisture — reroute to exterior wall/roof.” No efficiency or code-search.'},
    {title:'How we write — the field system', body:'Every finding uses one sentence: Location -> Condition -> Implication -> Recommendation -> Limitation (if needed). We batch evidence in the field (photo -> voice note -> video) and tag by system so your report is consistent, defensible, and tied to the same checklist you can follow along with on inspection day.'},
  ];
  let pageNum = 4;
  for(const sec of pages){
    const p = addPage();
    p.drawRectangle({x:0,y:H-72,width:W,height:72, color: NAVY});
    drawText(p, sec.title.toUpperCase(), margin, H-42, 10, bold, rgb(1,1,1));
    drawText(p, `Page ${pageNum} of 12`, W - margin - font.widthOfTextAtSize(`Page ${pageNum} of 12`,7), H-42, 7, font, rgb(0.8,0.82,0.88));
    let y = H-108;
    drawText(p, sec.title, margin, y, 14, bold, NAVY); y-=8;
    p.drawLine({start:{x:margin,y:y}, end:{x:margin+36,y:y}, thickness:2.5, color: ROYAL}); y-=18;
    if(sec.key) { drawText(p, sec.key, margin, y, 7, bold, ROYAL); y-=14; }
    y = wrap(p, sec.body, margin, y, 9, font, INK, W-margin*2, 13);
    // callout
    y-=16;
    p.drawRectangle({x:margin,y:y-38,width:W-margin*2,height:38, color: rgb(0.96,0.97,0.985), borderColor: LIGHT, borderWidth:1});
    drawText(p, 'Field tip', margin+10, y-14, 8, bold, ROYAL);
    wrap(p, 'Ask your inspector “where is that in the report?” — you should be able to trace every finding back to a photo and a checklist item.', margin+10, y-28, 7.5, font, INK, W-margin*2-20, 11);
    drawText(p, `Page ${pageNum} of 12`, W - margin - font.widthOfTextAtSize(`Page ${pageNum} of 12`,7), 34, 7, font, MUTED);
    pageNum++;
  }

  // PAGE 10 - Limitations
  {
    const p = addPage();
    p.drawRectangle({x:0,y:H-72,width:W,height:72, color: NAVY});
    drawText(p, 'LIMITATIONS & EXCLUSIONS', margin, H-42, 10, bold, rgb(1,1,1));
    drawText(p, 'Page 10 of 12', W - margin - font.widthOfTextAtSize('Page 10 of 12',7), H-42, 7, font, rgb(0.8,0.82,0.88));
    let y = H-108;
    drawText(p, 'What we cannot do — and why it protects you', margin, y, 13, bold, NAVY); y-=18;
    y = wrap(p, 'A home inspection is visual and non-invasive. We do not open walls, lift shingles, move storage, or perform engineering, environmental lab, sewer, or code-search work unless you book it. Weather, access, and occupancy can limit areas — any limitation is listed in your report so you know what was not seen.', margin, y, 9, font, INK, W-margin*2, 13);
    y-=12;
    drawText(p, 'Common exclusions', margin, y, 10, bold, ROYAL); y-=14;
    const items = ['Inside walls / under flooring', 'Sewer line (unless scope added)', 'Radon / mold / asbestos lab testing (screen only)', 'Pest / wood-destroying organisms (separate)', 'Pools, irrigation, solar unless booked', 'Remaining-life / cost-to-cure predictions'];
    for(const it of items){ drawText(p, '*  '+it, margin, y, 8.5, font, INK); y-=13; }
    drawText(p, 'Page 10 of 12', W - margin - font.widthOfTextAtSize('Page 10 of 12',7), 34, 7, font, MUTED);
  }
  // PAGE 11 - Next steps
  {
    const p = addPage();
    p.drawRectangle({x:0,y:H-72,width:W,height:72, color: NAVY});
    drawText(p, 'NEXT STEPS AFTER THE REPORT', margin, H-42, 10, bold, rgb(1,1,1));
    drawText(p, 'Page 11 of 12', W - margin - font.widthOfTextAtSize('Page 11 of 12',7), H-42, 7, font, rgb(0.8,0.82,0.88));
    let y = H-108;
    drawText(p, 'Prioritize like an inspector', margin, y, 13, bold, NAVY); y-=18;
    y = wrap(p, '1) Safety first — GFCI/AFCI, TPR, rail/step, egress, combustion/air.  2) Structure & moisture — roof, foundation, grading, plumbing leaks.  3) Systems — HVAC, electrical capacity, water heater, drainage.  4) Comfort & efficiency last — insulation, windows, cosmetic.', margin, y, 9, font, INK, W-margin*2, 13);
    y-=12;
    drawText(p, 'Your 48-hour checklist', margin, y, 10, bold, ROYAL); y-=14;
    const steps = ['Review the report summary + tagged photos', 'Share it with your agent — negotiate with specific line items', 'Book follow-up specialists only where we recommended', 'Schedule maintenance: roof, HVAC filter, water heater, GFCI test'];
    for(const s of steps){ drawText(p, '*  '+s, margin, y, 8.5, font, INK); y-=13; }
    y-=14;
    p.drawRectangle({x:margin,y:y-44,width:W-margin*2,height:44, color: ROYAL});
    drawText(p, 'Book your inspection at ballkingdom.com — or call/text your inspector directly.', margin+12, y-18, 9, bold, rgb(1,1,1));
    drawText(p, 'Page 11 of 12', W - margin - font.widthOfTextAtSize('Page 11 of 12',7), 34, 7, font, MUTED);
  }
  // PAGE 12 - Back cover + CTA
  {
    const p = addPage();
    p.drawRectangle({x:0,y:0,width:W,height:H, color: NAVY});
    p.drawCircle({x:W/2, y:560, size:42, color: rgb(1,1,1), borderColor: ROYAL, borderWidth:2});
    p.drawCircle({x:W/2, y:560, size:28, color: ROYAL});
    drawText(p, 'BK', W/2 - bold.widthOfTextAtSize('BK',18)/2, 566, 18, bold, rgb(1,1,1));
    drawText(p, 'EST 2019', W/2 - font.widthOfTextAtSize('EST 2019',6)/2, 548, 6, font, rgb(0.75,0.78,0.84));
    drawText(p, 'THE BALLERS KINGDOM — BALLERS KINGDOM HOME INSPECTIONS', W/2 - font.widthOfTextAtSize('THE BALLERS KINGDOM — BALLERS KINGDOM HOME INSPECTIONS',7)/2, 500, 7, bold, rgb(1,1,1));
    drawText(p, 'Building Ballers. Advancing Kingdoms.', W/2 - italic.widthOfTextAtSize('Building Ballers. Advancing Kingdoms.',11)/2, 470, 11, italic, rgb(0.85,0.88,0.92));
    drawText(p, 'Book at ballkingdom.com  ·  info@ballkingdom.com', W/2 - font.widthOfTextAtSize('Book at ballkingdom.com  ·  info@ballkingdom.com',9)/2, 430, 9, font, rgb(0.8,0.82,0.88));
    drawText(p, 'Branded leave-behind — not the 15-chapter classroom study guide.', W/2 - font.widthOfTextAtSize('Branded leave-behind — not the 15-chapter classroom study guide.',7)/2, 380, 7, font, rgb(0.65,0.70,0.80));
    p.drawRectangle({x:W/2-90,y:300,width:180,height:36, color: rgb(1,1,1)});
    drawText(p, 'BOOK AN INSPECTION ->', W/2 - bold.widthOfTextAtSize('BOOK AN INSPECTION ->',9)/2, 322, 9, bold, ROYAL);
    drawText(p, '© 2026 The Ballers Kingdom. All rights reserved.', W/2 - font.widthOfTextAtSize('© 2026 The Ballers Kingdom. All rights reserved.',7)/2, 90, 7, font, rgb(0.6,0.65,0.75));
    drawText(p, 'Page 12 of 12', W - margin - font.widthOfTextAtSize('Page 12 of 12',7), 34, 7, font, rgb(0.6,0.65,0.75));
  }

  const bytes = await pdf.save();
  await fs.writeFile(outPath, bytes);
  console.log(`Built ${outPath} — ${pdf.getPageCount()} pages, ${bytes.length} bytes`);
}

main().catch(e=>{console.error(e); process.exit(1)});
