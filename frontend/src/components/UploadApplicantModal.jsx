import { useState } from 'react';
import { 
  FileIcon, 
  HourglassIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  UploadIcon 
} from './Icons';
import './UploadApplicantModal.css';

export default function UploadApplicantModal({ 
  onClose, 
  onSubmit, 
  loading, 
  candidateEmail = '', 
  uploadProgress = null 
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.txt');
    });

    if (candidateEmail) {
      if (valid.length > 0) setSelectedFiles([valid[0]]);
    } else {
      setSelectedFiles(prev => [...prev, ...valid]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const valid = files.filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.txt');
    });

    if (candidateEmail) {
      if (valid.length > 0) setSelectedFiles([valid[0]]);
    } else {
      setSelectedFiles(prev => [...prev, ...valid]);
    }
  };

  const removeFile = (idx) => {
    if (loading || uploadProgress) return;
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || loading || uploadProgress) return;
    onSubmit(selectedFiles);
  };

  const isUploading = !!uploadProgress;
  const isFinished = uploadProgress && uploadProgress.files.every(f => f.status === 'success' || f.status === 'error');

  return (
    <div className="upload-modal-overlay" onClick={isUploading && !isFinished ? undefined : onClose}>
      <div className="upload-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{candidateEmail ? 'Re-screen Candidate' : 'Screen Candidates'}</h3>
        <p>
          {candidateEmail
            ? "Upload a new resume file to update this candidate's screening analysis."
            : 'Select or drag multiple resumes to instantly screen candidates using AI.'}
        </p>

        {isUploading ? (
          <div className="upload-progress-wrapper">
            <h4 className="progress-title">
              {isFinished ? 'Screening Completed' : 'Analyzing Resumes...'}
            </h4>
            <div className="progress-list">
              {uploadProgress.files.map((file, i) => (
                <div key={i} className="progress-item">
                  <span className="progress-file-name" title={file.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <FileIcon size={14} /> {file.name}
                  </span>
                  <span className={`status-badge ${file.status}`}>
                    {file.status === 'pending' && (
                      <span className="badge-text pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <HourglassIcon size={12} /> Pending
                      </span>
                    )}
                    {file.status === 'loading' && (
                      <span className="badge-text loading">
                        <span className="mini-spinner" /> Screening...
                      </span>
                    )}
                    {file.status === 'success' && (
                      <span className="badge-text success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircleIcon size={12} /> Complete
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="badge-text error" title={file.errorMsg} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <XCircleIcon size={12} /> Failed
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="upload-modal-form">
            <div className="modal-input-field">
              <label htmlFor="cand-resume">Candidate Resumes</label>
              <div 
                className={`modal-file-input-wrapper ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="cand-resume"
                  type="file"
                  accept=".pdf,.txt"
                  multiple={!candidateEmail}
                  onChange={handleFileChange}
                  disabled={loading}
                />
                <span className="modal-file-icon"><UploadIcon size={24} /></span>
                <span className="modal-file-hint">
                  {candidateEmail 
                    ? 'Click or drag a single resume file'
                    : 'Click or drag multiple .pdf or .txt resumes'}
                </span>
                <span className="modal-file-support">
                  Max file size: 10MB per document
                </span>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="selected-files-container">
                <h4>Selected Files ({selectedFiles.length})</h4>
                <div className="selected-files-list">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="selected-file-item">
                      <span className="file-item-name" title={file.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <FileIcon size={14} /> {file.name}
                      </span>
                      <button 
                        type="button" 
                        className="remove-file-btn" 
                        onClick={() => removeFile(idx)}
                        disabled={loading}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                disabled={selectedFiles.length === 0 || loading}
              >
                {candidateEmail ? 'Re-screen Candidate' : `Screen ${selectedFiles.length} Resume${selectedFiles.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        )}

        {isFinished && (
          <div className="modal-actions" style={{ marginTop: '24px' }}>
            <button
              type="button"
              className="screen-modal-btn submit"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
