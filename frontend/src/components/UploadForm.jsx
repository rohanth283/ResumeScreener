import { useState } from 'react';
import './UploadForm.css';

function UploadForm({ onSubmit, loading }) {
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [fileName, setFileName] = useState('');

  const canSubmit = jobDescription.trim() && resumeFile && !loading;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setResumeFile(file);
      setFileName(file.name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ jobDescription, resumeFile });
  };

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="job-description">Job Description</label>
        <textarea
          id="job-description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={8}
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="resume-file">Resume</label>
        <div className="file-input-wrapper">
          <input
            id="resume-file"
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileChange}
            disabled={loading}
          />
          <span className="file-hint">
            {fileName || 'Choose a .pdf or .txt file'}
          </span>
        </div>
      </div>

      <button type="submit" className="screen-btn" disabled={!canSubmit}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Screening...
          </>
        ) : (
          'Screen Resume'
        )}
      </button>
    </form>
  );
}

export default UploadForm;
