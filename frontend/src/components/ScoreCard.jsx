import './ScoreCard.css';

function getScoreColor(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function ScoreCard({ result }) {
  const { match_score, summary, strengths, improvements } = result;
  const scoreClass = getScoreColor(match_score);

  return (
    <div className="score-card">
      <div className="score-header">
        <h2>Match Report</h2>
        <div className={`score-badge score-badge--${scoreClass}`}>
          <span className="score-value">{match_score}</span>
          <span className="score-label">/ 100</span>
        </div>
      </div>

      <div className="score-bar-container">
        <div
          className={`score-bar score-bar--${scoreClass}`}
          style={{ width: `${match_score}%` }}
          role="progressbar"
          aria-valuenow={match_score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <section className="score-section">
        <h3>Summary</h3>
        <p>{summary}</p>
      </section>

      <div className="score-columns">
        <section className="score-section">
          <h3 className="section-strengths">Strengths</h3>
          <ul>
            {strengths.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="score-section">
          <h3 className="section-improvements">Improvement Areas</h3>
          <ul>
            {improvements.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default ScoreCard;
