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
                <span className="meta-filename flex-icon-align">
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
              {applicant.screening_raw ? (
                (() => {
                  const raw = applicant.screening_raw;
                  const subScores = raw.scores || {};
                  const deductions = raw.deductions || [];
                  const rec = raw.recommendation || 'Potential Match';
                  
                  // Map recommendation to dynamic color classes
                  let recClass = 'consider';
                  if (rec.includes('Strong') || rec.includes('Recommended')) recClass = 'strong';
                  else if (rec.includes('Reject') || rec.includes('Weak')) recClass = 'reject';
                  
                  return (
                    <div className="enterprise-report">
                      {/* Overall Decision Banner */}
                      <div className={`decision-banner ${recClass}`}>
                        <div className="decision-title-row">
                          <span className="decision-label">Recommendation Decision</span>
                          <span className="decision-badge">{rec}</span>
                        </div>
                        <p className="decision-reason">{raw.decision_reasoning || raw.summary_text || ''}</p>
                      </div>

                      {/* Weighted Scoring Rubric Breakdown */}
                      <div className="detail-block">
                        <h5>Weighted Rubric Scores</h5>
                        <div className="sub-scores-grid">
                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Technical Skills Match (40%)</span>
                              <strong>{subScores.skills || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill skills" style={{ width: `${subScores.skills || 0}%` }}></div>
                            </div>
                          </div>

                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Relevant Experience (25%)</span>
                              <strong>{subScores.experience || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill experience" style={{ width: `${subScores.experience || 0}%` }}></div>
                            </div>
                          </div>

                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Education Fit (10%)</span>
                              <strong>{subScores.education || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill education" style={{ width: `${subScores.education || 0}%` }}></div>
                            </div>
                          </div>

                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Projects Relevance (10%)</span>
                              <strong>{subScores.projects || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill projects" style={{ width: `${subScores.projects || 0}%` }}></div>
                            </div>
                          </div>

                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Certifications Match (5%)</span>
                              <strong>{subScores.certifications || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill certifications" style={{ width: `${subScores.certifications || 0}%` }}></div>
                            </div>
                          </div>

                          <div className="score-row">
                            <div className="score-row-meta">
                              <span>Industry Alignment (10%)</span>
                              <strong>{subScores.industry_alignment || 0}/100</strong>
                            </div>
                            <div className="score-progress-bar-bg">
                              <div className="score-progress-bar-fill alignment" style={{ width: `${subScores.industry_alignment || 0}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Side-by-side Experience & Education Comparison */}
                      <div className="comparison-grid">
                        <div className="comparison-card">
                          <h6>Experience Required</h6>
                          <p>{raw.experience_required || 'No experience requirements specified.'}</p>
                        </div>
                        <div className="comparison-card">
                          <h6>Candidate Experience</h6>
                          <p>{raw.experience_candidate || 'No experience details extracted.'}</p>
                        </div>
                      </div>

                      {/* Education Match Info */}
                      <div className="detail-block">
                        <div className="edu-match-row">
                          <span>Education Credentials Fit:</span>
                          <span className={`edu-match-tag ${raw.education_match?.toLowerCase() || 'poor'}`}>
                            {raw.education_match || 'Not Evaluated'}
                          </span>
                        </div>
                      </div>

                      {/* Skills Section */}
                      <div className="detail-block">
                        <h5>Matched Skills</h5>
                        {raw.matched_skills && raw.matched_skills.length > 0 ? (
                          <div className="skills-badge-container">
                            {raw.matched_skills.map((skill, idx) => (
                              <span key={idx} className="skill-badge matched">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="no-skills-msg">No matched skills identified.</p>
                        )}
                      </div>

                      {raw.related_skills_found && raw.related_skills_found.length > 0 && (
                        <div className="detail-block">
                          <h5>Related/Partial Matching Skills</h5>
                          <div className="skills-badge-container">
                            {raw.related_skills_found.map((skill, idx) => (
                              <span key={idx} className="skill-badge partial">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="detail-block">
                        <h5>Missing Skills</h5>
                        {raw.missing_skills && raw.missing_skills.length > 0 ? (
                          <div className="skills-badge-container">
                            {raw.missing_skills.map((skill, idx) => (
                              <span key={idx} className="skill-badge missing">
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="no-skills-msg">No missing skills identified.</p>
                        )}
                      </div>

                      {/* Key Projects & Certifications */}
                      <div className="grid-two-columns">
                        <div className="detail-block">
                          <h5>Key Projects Extracted</h5>
                          {raw.key_projects && raw.key_projects.length > 0 ? (
                            <ul className="drawer-list project-list">
                              {raw.key_projects.map((proj, idx) => (
                                <li key={idx}>{proj}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-items-msg">No projects highlighted.</p>
                          )}
                        </div>

                        <div className="detail-block">
                          <h5>Certifications Found</h5>
                          {raw.certifications_found && raw.certifications_found.length > 0 ? (
                            <ul className="drawer-list cert-list">
                              {raw.certifications_found.map((cert, idx) => (
                                <li key={idx}>{cert}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-items-msg">No certifications found.</p>
                          )}
                        </div>
                      </div>

                      {/* Strengths & Concerns */}
                      <div className="detail-block">
                        <h5>Key Strengths</h5>
                        <ul className="drawer-list strengths-list">
                          {(raw.strengths || []).map((str, idx) => (
                            <li key={idx}>{str}</li>
                          ))}
                        </ul>
                      </div>

                      {raw.concerns && raw.concerns.length > 0 && (
                        <div className="detail-block">
                          <h5>Concerns</h5>
                          <ul className="drawer-list concerns-list">
                            {raw.concerns.map((con, idx) => (
                              <li key={idx}>{con}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Deductions Panel */}
                      {deductions.length > 0 && (
                        <div className="detail-block">
                          <h5>Deductions Applied</h5>
                          <div className="deductions-container">
                            {deductions.map((ded, idx) => (
                              <div key={idx} className="deduction-item-row">
                                <span className="deduction-reason-text">{ded.reason}</span>
                                <span className="deduction-points-badge">-{ded.points_lost} pts</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended Interview Questions */}
                      {raw.interview_questions && raw.interview_questions.length > 0 && (
                        <div className="detail-block interview-questions-section">
                          <h5>Recommended Interview Questions</h5>
                          <div className="questions-list-container">
                            {raw.interview_questions.map((q, idx) => (
                              <div key={idx} className="question-card">
                                <span className="question-number">Q{idx + 1}</span>
                                <p className="question-text">{q}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
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
              )}

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
                <span className="file-info flex-icon-align" title={applicant.resume_filename}>
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
