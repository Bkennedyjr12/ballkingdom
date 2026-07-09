export default function FigureCard({ figure }) {
  return (
    <figure className="hi-figure-card">
      <img src={figure.assetPath} alt={figure.altText} />
      <figcaption className="hi-figure-meta">
        <span className="hi-figure-tag">{figure.topicTag}</span>
        <h4>{figure.caption}</h4>
        <p>{figure.sourcePageReference}</p>
      </figcaption>
    </figure>
  );
}
