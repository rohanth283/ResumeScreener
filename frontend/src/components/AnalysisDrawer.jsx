import { useEffect, useState } from 'react';
import './AnalysisDrawer.css';

export default function AnalysisDrawer({ isOpen, onClose, applicant, onRescreen }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [activeTab, setActiveTab] = useState('report');

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setActiveTab('report');
    } else {
      // Allow transition to finish before unmounting drawer
      const timer = setTimeout(() => setShouldRender(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, applicant]);

  if (!shouldRender || !applicant) return null;

  const score = applicant.match_score;
  const scoreClass = score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'poor';

  const handleDownloadResume = () => {
    const element = document.createElement("a");
    const file = new Blob([applicant.resume_text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    const originalName = applicant.resume_filename;
    element.download = originalName.toLowerCase().endsWith('.txt') 
      ? originalName 
      : `${originalName.substring(0, originalName.lastIndexOf('.')) || originalName}_resume.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className={`drawer-container ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>Screening Report</h3>
          <button type="button" className="close-drawer-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {/* Score & Contact section */}
          <div className="score-section">
            <div className={`score-circle ${scoreClass}`}>
              {score}%
            </div>
            <div className="candidate-meta">
              <h4>{applicant.name || 'Unknown Candidate'}</h4>
              <p>{applicant.email}</p>
              <span className="drawer-file-label">Resume File</span>
              <div className="meta-filename-row">
                <span className="meta-filename">📄 {applicant.resume_filename}</span>
                <button
                  type="button"
                  className="update-resume-btn"
                  onClick={() => onRescreen(applicant)}
                >
                  Update Resume
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="drawer-tabs">
            <button 
              type="button" 
              className={`drawer-tab-btn ${activeTab === 'report' ? 'active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              Evaluation Report
            </button>
            <button 
              type="button" 
              className={`drawer-tab-btn ${activeTab === 'resume' ? 'active' : ''}`}
              onClick={() => setActiveTab('resume')}
            >
              Resume Viewer
            </button>
          </div>

          {activeTab === 'report' ? (
            <>
              {/* Evaluation Summary */}
              <div className="detail-block">
                <h5>Evaluation Summary</h5>
                {Array.isArray(applicant.summary) ? (
                  <ul className="drawer-list summary-list">
                    {applicant.summary.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{applicant.summary}</p>
                )}
              </div>

              {/* Matched Skills */}
              <div className="detail-block">
                <h5>Matched Skills</h5>
                {applicant.skills_matched && applicant.skills_matched.length > 0 ? (
                  <div className="skills-badge-container">
                    {applicant.skills_matched.map((skill, idx) => (
                      <span key={idx} className="skill-badge matched">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="no-skills-msg">No matched skills identified.</p>
                )}
              </div>

              {/* Missing Skills */}
              <div className="detail-block">
                <h5>Missing Skills</h5>
                {applicant.skills_missing && applicant.skills_missing.length > 0 ? (
                  <div className="skills-badge-container">
                    {applicant.skills_missing.map((skill, idx) => (
                      <span key={idx} className="skill-badge missing">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="no-skills-msg">No missing skills identified.</p>
                )}
              </div>

              {/* Strengths */}
              <div className="detail-block">
                <h5>Strengths</h5>
                <ul className="drawer-list strengths-list">
                  {applicant.strengths.map((str, idx) => (
                    <li key={idx}>{str}</li>
                  ))}
                </ul>
              </div>

              {/* Gaps / Areas to Improve */}
              <div className="detail-block">
                <h5>Gaps / Areas to Improve</h5>
                <ul className="drawer-list improvements-list">
                  {applicant.improvements.map((imp, idx) => (
                    <li key={idx}>{imp}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <div className="resume-viewer-tab">
              <div className="resume-viewer-header">
                <span className="file-info" title={applicant.resume_filename}>
                  📄 {applicant.resume_filename}
                </span>
                <button 
                  type="button" 
                  className="download-resume-btn"
                  onClick={handleDownloadResume}
                >
                  Download (.txt)
                </button>
              </div>
              <pre className="resume-text-content">
                {applicant.resume_text}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
