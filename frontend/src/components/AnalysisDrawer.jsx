import { useEffect, useState } from 'react';
import { FlagIcon, FileIcon, AlertIcon } from './Icons';
import './AnalysisDrawer.css';

export default function AnalysisDrawer({ isOpen, onClose, applicant, onRescreen, onToggleReview, onDelete, onSwitchToApplicant, token, apiUrl, jobId }) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [activeTab, setActiveTab] = useState('report');
  const [iframeLoading, setIframeLoading] = useState(true);
  
  const [altMatches, setAltMatches] = useState([]);
  const [loadingAltMatches, setLoadingAltMatches] = useState(false);
  const [screeningTargetJobId, setScreeningTargetJobId] = useState(null);

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

  useEffect(() => {
    if (isOpen && applicant && jobId) {
      setAltMatches([]);
      setLoadingAltMatches(true);
      fetch(`${apiUrl}/jobs/${jobId}/applicants/${applicant.id}/alternative-matches`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load alternative matches.');
          return res.json();
        })
        .then(data => {
          setAltMatches(data);
          setLoadingAltMatches(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingAltMatches(false);
        });
    }
  }, [isOpen, applicant, jobId, apiUrl, token]);

  useEffect(() => {
    setIframeLoading(true);
  }, [activeTab, applicant]);

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

  const handleScreenForAlternative = (targetJobId) => {
    setScreeningTargetJobId(targetJobId);
    fetch(`${apiUrl}/jobs/${jobId}/applicants/${applicant.id}/transfer-screen/${targetJobId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to screen for alternative job.');
        return res.json();
      })
      .then((newApplicant) => {
        setAltMatches(prev => prev.map(m => {
          if (m.job_id === targetJobId) {
            return {
              ...m,
              is_screened: true,
              screened_score: newApplicant.match_score,
              screened_applicant_id: newApplicant.id
            };
          }
          return m;
        }));
        setScreeningTargetJobId(null);
      })
      .catch(err => {
        console.error(err);
        alert(err.message);
        setScreeningTargetJobId(null);
      });
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
            <div className="candidate-meta" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '12px' }}>
                <h4 style={{ margin: 0 }}>{applicant.name || 'Unknown Candidate'}</h4>
                <button
                  type="button"
                  className={`drawer-flag-btn ${applicant.is_reviewed ? 'flagged' : ''}`}
                  onClick={() => onToggleReview(applicant)}
                  title={applicant.is_reviewed ? "Marked as Reviewed" : "Mark as Reviewed"}
                >
                  <FlagIcon size={20} fill={applicant.is_reviewed ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p>{applicant.email}</p>
              <span className="drawer-file-label">Resume File</span>
              <div className="meta-filename-row">
                <span className="meta-filename" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FileIcon size={14} /> {applicant.resume_filename}
                </span>
                <div className="meta-actions">
                  <button
                    type="button"
                    className="update-resume-btn"
                    onClick={() => onRescreen(applicant)}
                  >
                    Update Resume
                  </button>
                  <button
                    type="button"
                    className="delete-candidate-btn"
                    onClick={() => onDelete(applicant)}
                  >
                    Delete Candidate
                  </button>
                </div>
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
              {/* AI Disclaimer Card */}
              <div className="audit-disclaimer-card" style={{
                background: 'var(--warning-light)',
                border: '1px solid rgba(249, 171, 0, 0.25)',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '12px',
                lineHeight: '1.5',
                color: '#B06000',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <AlertIcon size={16} style={{ flexShrink: 0, marginTop: '1px', color: '#B06000' }} />
                <div>
                  <strong>AI-Generated Evaluation:</strong> This report was compiled by AI to assist the screening process. Please conduct a manual review before making final candidate decisions.
                </div>
              </div>
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

              {/* Alternative Positions Match */}
              <div className="detail-block alternative-positions-block">
                <h5>Alternative Position Matches</h5>
                {loadingAltMatches ? (
                  <div className="alt-loading">
                    <span className="loading-spinner mini"></span>
                    <p>Analyzing candidate against other active positions...</p>
                  </div>
                ) : altMatches.length === 0 ? (
                  <p className="no-alt-msg">No other active job positions found to match against.</p>
                ) : (
                  <div className="alt-matches-list">
                    {altMatches.map((match) => (
                      <div key={match.job_id} className="alt-match-card">
                        <div className="alt-match-info">
                          <div className="alt-match-title-row">
                            <span className="alt-match-title">{match.title}</span>
                            <span className={`alt-match-badge ${match.similarity >= 80 ? 'high' : match.similarity >= 50 ? 'medium' : 'low'}`}>
                              {match.similarity}% Match
                            </span>
                          </div>
                          {match.department && <span className="alt-match-dept">{match.department}</span>}
                        </div>
                        <div className="alt-match-action">
                          {match.is_screened ? (
                            <div className="screened-status-row">
                              <span className="screened-score-badge">
                                Screened: <strong>{match.screened_score}%</strong>
                              </span>
                              <button
                                type="button"
                                className="view-alt-app-btn"
                                onClick={() => onSwitchToApplicant(match.job_id, match.screened_applicant_id)}
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="screen-alt-btn"
                              disabled={screeningTargetJobId !== null}
                              onClick={() => handleScreenForAlternative(match.job_id)}
                            >
                              {screeningTargetJobId === match.job_id ? (
                                <>
                                  <span className="loading-spinner mini"></span>
                                  Screening...
                                </>
                              ) : (
                                "Screen for Role"
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="resume-viewer-tab" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px' }}>
              <div className="resume-viewer-header">
                <span className="file-info" title={applicant.resume_filename} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FileIcon size={14} /> {applicant.resume_filename}
                </span>
                <button 
                  type="button" 
                  className="download-resume-btn"
                  onClick={handleDownloadResume}
                >
                  Download (.txt)
                </button>
              </div>
              {applicant.has_resume_pdf ? (
                <div style={{ position: 'relative', width: '100%', height: '600px', marginTop: '12px' }}>
                  {iframeLoading && (
                    <div className="iframe-loader-container">
                      <span className="loading-spinner" />
                      <p>Loading resume PDF...</p>
                    </div>
                  )}
                  <iframe
                    src={`${apiUrl}/jobs/${jobId}/applicants/${applicant.id}/resume?token=${token}`}
                    title={`Resume PDF - ${applicant.name}`}
                    onLoad={() => setIframeLoading(false)}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      backgroundColor: '#ffffff',
                      opacity: iframeLoading ? 0 : 1,
                      transition: 'opacity 0.2s ease-in-out'
                    }}
                  />
                </div>
              ) : (
                <pre className="resume-text-content">
                  {applicant.resume_text}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
