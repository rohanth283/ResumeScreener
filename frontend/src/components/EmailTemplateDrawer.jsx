import { useEffect, useState } from 'react';
import './EmailTemplateDrawer.css';

export default function EmailTemplateDrawer({ 
  isOpen, 
  onClose, 
  selectedApplicants = [], 
  job, 
  token, 
  apiUrl,
  onSentComplete 
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [subjectTemplate, setSubjectTemplate] = useState('Application Update: {job_title}');
  const [bodyTemplate, setBodyTemplate] = useState(
    'Hello {name},\n\n' +
    'Thank you for applying to the {job_title} position. Your application has been received and is under consideration.\n\n' +
    'We will be in touch with you shortly regarding the next steps in our hiring process.\n\n' +
    'Best regards,\n' +
    'Recruiting Team'
  );
  
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState(null); // { sent_count, failed_count, results }
  const [sendingError, setSendingError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setSendSummary(null);
      setSendingError(null);
      setSending(false);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender || !job || selectedApplicants.length === 0) return null;

  // Render a live preview for the first selected candidate
  const getRenderedPreview = () => {
    const sampleCandidate = selectedApplicants[0];
    const name = sampleCandidate.name || 'Candidate';
    const jobTitle = job.title || 'Position';
    const scoreStr = `${sampleCandidate.match_score}%`;
    const emailStr = sampleCandidate.email;

    const renderedSubject = subjectTemplate
      .replace(/{name}/g, name)
      .replace(/{job_title}/g, jobTitle)
      .replace(/{score}/g, scoreStr)
      .replace(/{email}/g, emailStr);

    const renderedBody = bodyTemplate
      .replace(/{name}/g, name)
      .replace(/{job_title}/g, jobTitle)
      .replace(/{score}/g, scoreStr)
      .replace(/{email}/g, emailStr);

    return { subject: renderedSubject, body: renderedBody, candidateName: name };
  };

  const preview = getRenderedPreview();

  const handleSendEmails = async (e) => {
    e.preventDefault();
    setSending(true);
    setSendingError(null);
    setSendSummary(null);

    const payload = {
      applicant_ids: selectedApplicants.map(app => app.id),
      subject_template: subjectTemplate,
      body_template: bodyTemplate
    };

    try {
      const response = await fetch(`${apiUrl}/jobs/${job.id}/applicants/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to dispatch emails.');
      }

      setSendSummary(data);
    } catch (err) {
      console.error(err);
      setSendingError(err.message);
    } finally {
      setSending(false);
    }
  };

  const getCandidateSendStatus = (candId) => {
    if (!sendSummary) return 'pending';
    const match = sendSummary.results.find(r => r.applicant_id === candId);
    return match ? match.status : 'pending';
  };

  const getCandidateSendError = (candId) => {
    if (!sendSummary) return null;
    const match = sendSummary.results.find(r => r.applicant_id === candId);
    return match ? match.error : null;
  };

  const isFinished = !!sendSummary;

  return (
    <>
      <div className="drawer-overlay" onClick={sending ? undefined : onClose} />
      <div className={`drawer-container ${isOpen ? 'open' : ''} email-drawer`}>
        <div className="drawer-header">
          <h3>Email Outreach</h3>
          <button 
            type="button" 
            className="close-drawer-btn" 
            onClick={onClose}
            disabled={sending}
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="email-outreach-intro">
            <span className="outreach-badge">Outreach Queue</span>
            <h4>Personalized Bulk Dispatch</h4>
            <p>
              Sending to <strong>{selectedApplicants.length}</strong> selected candidate{selectedApplicants.length === 1 ? '' : 's'} for the position of <strong>{job.title}</strong>.
            </p>
          </div>

          {isFinished ? (
            <div className="send-summary-results">
              <div className="summary-status-card">
                <span className="summary-icon">✉️</span>
                <h4>Dispatch Summary</h4>
                <div className="summary-metrics">
                  <span className="metric success">✅ {sendSummary.sent_count} Sent</span>
                  {sendSummary.failed_count > 0 && (
                    <span className="metric error">❌ {sendSummary.failed_count} Failed</span>
                  )}
                </div>
              </div>

              <div className="recipient-list status-checking">
                <h5>Dispatch Status</h5>
                <div className="recipient-rows">
                  {selectedApplicants.map(app => {
                    const status = getCandidateSendStatus(app.id);
                    const errorMsg = getCandidateSendError(app.id);
                    return (
                      <div key={app.id} className="recipient-row-item">
                        <div className="recipient-info">
                          <span className="name">{app.name || 'Unknown Candidate'}</span>
                          <span className="email">{app.email}</span>
                        </div>
                        <span className={`status-badge-mini ${status}`} title={errorMsg}>
                          {status === 'success' && '✅ Sent'}
                          {status === 'failed' && '❌ Failed'}
                          {status === 'pending' && '⏳ Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="drawer-actions-row">
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={onSentComplete}
                  style={{ width: '100%' }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendEmails} className="email-drawer-form">
              {/* Recipient list wrapper */}
              <div className="recipient-list">
                <h5>Recipients ({selectedApplicants.length})</h5>
                <div className="recipient-chips">
                  {selectedApplicants.map(app => (
                    <div key={app.id} className="recipient-chip">
                      <span className="chip-name">{app.name || 'Candidate'}</span>
                      <span className="chip-email">&lt;{app.email}&gt;</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subject Editor */}
              <div className="email-input-group">
                <label htmlFor="email-subject-tpl">Subject Template</label>
                <input
                  id="email-subject-tpl"
                  type="text"
                  value={subjectTemplate}
                  onChange={(e) => setSubjectTemplate(e.target.value)}
                  placeholder="e.g. Application Update: {job_title}"
                  required
                  disabled={sending}
                />
              </div>

              {/* Body Editor */}
              <div className="email-input-group">
                <label htmlFor="email-body-tpl">Body Template</label>
                <textarea
                  id="email-body-tpl"
                  rows={8}
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  placeholder="Hello {name}..."
                  required
                  disabled={sending}
                />
              </div>

              {/* Placeholders helper guide */}
              <div className="placeholders-guide">
                <h5>Placeholders Guide</h5>
                <p>Use these tokens to inject details dynamically for each recipient:</p>
                <div className="placeholder-tokens">
                  <code>{`{name}`}</code>
                  <code>{`{job_title}`}</code>
                  <code>{`{score}`}</code>
                  <code>{`{email}`}</code>
                </div>
              </div>

              {/* Real-time Personalized Preview Panel */}
              <div className="email-preview-panel">
                <div className="preview-header">
                  <span>Live Preview (Sample: {preview.candidateName})</span>
                </div>
                <div className="preview-content">
                  <div className="preview-subject">
                    <strong>Subject:</strong> {preview.subject}
                  </div>
                  <div className="preview-body">
                    {preview.body}
                  </div>
                </div>
              </div>

              {sendingError && (
                <div className="error-banner" style={{ marginTop: '16px' }}>
                  <strong>Failed to send:</strong> {sendingError}
                </div>
              )}

              {/* Action buttons */}
              <div className="drawer-actions-row">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={onClose}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={sending}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                >
                  {sending ? (
                    <>
                      <span className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                      Sending...
                    </>
                  ) : (
                    `Send to ${selectedApplicants.length} Candidate${selectedApplicants.length === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
