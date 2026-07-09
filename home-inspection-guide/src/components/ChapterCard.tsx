import ChecklistBlock from './ChecklistBlock';
import FigureCard from './FigureCard';
import ReportCommentCard from './ReportCommentCard';

export default function ChapterCard({ chapter, index, figures }) {
  return (
    <article className="hi-chapter" id={chapter.id}>
      <header className="hi-chapter-header">
        <div className="hi-chapter-number">{String(index + 1).padStart(2, '0')}</div>
        <div>
          <h2>{chapter.title}</h2>
          <p>{chapter.summary}</p>
        </div>
      </header>
      {chapter.sections.map((section) => (
        <section className="hi-topic" key={section.id}>
          <div className="hi-topic-main">
            <div className="hi-topic-copy">
              <h3 className="hi-topic-title">{section.title}</h3>
              <p>{section.body}</p>
              <ChecklistBlock title="Checklist" items={section.checklist} />
              <ReportCommentCard comments={section.reportLanguage} />
            </div>
            <aside className="hi-figure-column">
              {figures.filter((figure) => section.figureTags?.includes(figure.topicTag)).map((figure) => (
                <FigureCard key={figure.id} figure={figure} />
              ))}
            </aside>
          </div>
        </section>
      ))}
    </article>
  );
}
