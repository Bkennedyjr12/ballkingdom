export default function ChecklistBlock({ title, items }) {
  return (
    <div className="hi-block">
      <h4>{title}</h4>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}
