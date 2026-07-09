export default function GuideSearch() {
  return (
    <section className="hi-search-panel">
      <label htmlFor="guide-search" className="hi-kicker">Search the guide</label>
      <div className="hi-search-row">
        <input id="guide-search" className="hi-search" type="search" placeholder="Search drainage, GFCI, roof flashing..." />
        <span className="hi-count" data-result-count>All topics</span>
      </div>
    </section>
  );
}
