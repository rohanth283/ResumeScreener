import { useState } from 'react';
import './UploadApplicantModal.css';

export default function UploadApplicantModal({ onClose, onSubmit, loading, candidateEmail = '' }) {
  const [email, setEmail] = useState(candidateEmail);
  const [resumeFile, setResumeFile] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setResumeFile(file);
      setFileName(file.name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !resumeFile) return;

    onSubmit({
      email: email.trim(),
      resumeFile,
    });
  };

  const canSubmit = email.trim() && resumeFile && !loading;

  return (
    <div className="upload-modal-overlay" onClick={onClose}>
      <div className="upload-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{candidateEmail ? 'Re-screen Candidate' : 'Screen Candidate'}</h3>
        <p>
          {candidateEmail
            ? "Upload a new resume file to update this candidate's screening analysis."
            : 'Upload a resume to instantly screen the candidate against this job.'}
        </p>

        <form onSubmit={handleSubmit} className="upload-modal-form">
          <div className="modal-input-field">
            <label htmlFor="cand-email">Candidate Email Address</label>
            <input
              id="cand-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@example.com"
              required
              disabled={!!candidateEmail || loading}
            />
          </div>

          <div className="modal-input-field">
            <label htmlFor="cand-resume">Resume File</label>
            <div className="modal-file-input-wrapper">
              <input
                id="cand-resume"
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                disabled={loading}
              />
              <span className="modal-file-icon">📄</span>
              <span className="modal-file-hint">
                {fileName || 'Click or drag a .pdf or .txt resume'}
              </span>
              <span className="modal-file-support">
                Supports PDF or TXT files up to 10MB
              </span>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="screen-modal-btn cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="screen-modal-btn submit"
              disabled={!canSubmit}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  {candidateEmail ? 'Re-screening...' : 'Screening...'}
                </>
              ) : (
                candidateEmail ? 'Re-screen Candidate' : 'Screen Candidate'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
