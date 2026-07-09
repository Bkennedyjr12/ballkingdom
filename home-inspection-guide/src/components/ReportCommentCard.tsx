export default function ReportCommentCard({ comments }) {
  return (
    <div className="hi-block hi-report">
      <h4>Report Language</h4>
      <ul>{comments.map((comment) => <li key={comment}>{comment}</li>)}</ul>
    </div>
  );
}
