import GuideSearch from './components/GuideSearch';
import ChapterCard from './components/ChapterCard';
import FigureCard from './components/FigureCard';

export default function HomeInspectionGuide({ guide, figures }) {
  return (
    <main className="hi-shell">
      <GuideSearch />
      {guide.chapters.map((chapter, index) => (
        <ChapterCard key={chapter.id} chapter={chapter} index={index} figures={figures} />
      ))}
      <section className="hi-gallery">
        {figures.map((figure) => <FigureCard key={figure.id} figure={figure} />)}
      </section>
    </main>
  );
}
