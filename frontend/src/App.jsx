import { useState, useEffect } from 'react';
import Login from './components/Login';
import JobList from './components/JobList';
import NewJobModal from './components/NewJobModal';
import UploadApplicantModal from './components/UploadApplicantModal';
import AnalysisDrawer from './components/AnalysisDrawer';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/_/backend' : 'http://localhost:8000');

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [activeApplicant, setActiveApplicant] = useState(null);

  // Modals & Drawer State
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [editingJob, setEditingJob] = useState(null);
  const [rescreenApplicant, setRescreenApplicant] = useState(null);

  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(() => !!localStorage.getItem('auth_token'));
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);

  // Password Reset View States
  const [resetToken, setResetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'reset-password' ? params.get('token') : null;
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(null);

  // Fetch jobs list on mount or login
  useEffect(() => {
    if (token && user) {
      fetchJobs();
    }
  }, [token, user]);

  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const response = await fetch(`${API_URL}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load jobs.');
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setJobsLoading(false);
    }
  };

  const fetchApplicants = async (jobId) => {
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}/applicants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load applicants.');
      const data = await response.json();
      setApplicants(data);
    } catch (err) {
      console.error(err.message);
    }
  };

  const handleAuthSuccess = ({ token, user }) => {
    setToken(token);
    setUser(user);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setJobs([]);
    setActiveJob(null);
    setApplicants([]);
    setActiveApplicant(null);
    setEditingJob(null);
    setRescreenApplicant(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const handleManualLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      handleLogout();
    }
  };

  const handleSelectJob = (job) => {
    setActiveJob(job);
    fetchApplicants(job.id);
  };

  const handleCreateJob = async (jobData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(jobData),
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not create job.');

      // Append new job to local state and close modal
      setJobs((prev) => [...prev, data]);
      setIsNewJobModalOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditJob = async (jobId, jobData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(jobData),
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update job.');

      // Update jobs list
      setJobs((prev) => prev.map((j) => (j.id === jobId ? data : j)));
      // Update activeJob
      setActiveJob(data);
      setIsNewJobModalOpen(false);
      setEditingJob(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job and all of its applicants?')) return;
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Could not delete job.');

      // Remove from list and return to dashboard
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setActiveJob(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleScreenResume = async (files) => {
    setLoading(true);
    setError(null);

    // Initialize progress tracking state
    const progressFiles = files.map((file) => ({
      name: file.name,
      status: 'pending',
      errorMsg: null
    }));
    setUploadProgress({ files: progressFiles });

    let activeApplicantsCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Update this file status to loading
      setUploadProgress((prev) => {
        const updated = [...prev.files];
        updated[i] = { ...updated[i], status: 'loading' };
        return { files: updated };
      });

      try {
        const formData = new FormData();
        formData.append('resume_file', file);

        const response = await fetch(`${API_URL}/jobs/${activeJob.id}/screen`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });

        if (response.status === 401) {
          handleLogout();
          return;
        }

        let data = null;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        }

        if (!response.ok) {
          const errMsg = data?.detail || `Resume screening failed with status ${response.status}`;
          throw new Error(errMsg);
        }

        if (!data) {
          throw new Error('Received non-JSON response from server.');
        }

        // Append new applicant and sort descending by score
        setApplicants((prev) => {
          const updated = [...prev, data];
          return updated.sort((a, b) => b.match_score - a.match_score);
        });

        activeApplicantsCount += 1;

        // Update this file status to success
        setUploadProgress((prev) => {
          const updated = [...prev.files];
          updated[i] = { ...updated[i], status: 'success' };
          return { files: updated };
        });
      } catch (err) {
        console.error(err.message);
        // Update this file status to error
        setUploadProgress((prev) => {
          const updated = [...prev.files];
          updated[i] = { ...updated[i], status: 'error', errorMsg: err.message };
          return { files: updated };
        });
      }

      // Add a small delay between requests to avoid Gemini API Rate Limits (429)
      if (i < files.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }

    // Update local job applicant count once done
    if (activeApplicantsCount > 0) {
      setJobs((prev) => prev.map((j) => {
        if (j.id === activeJob.id) {
          return { ...j, applicant_count: (j.applicant_count || 0) + activeApplicantsCount };
        }
        return j;
      }));
    }

    setLoading(false);
  };

  const handleRescreenApplicant = async (resumeFile) => {
    if (!rescreenApplicant) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume_file', resumeFile);

      const response = await fetch(`${API_URL}/jobs/${activeJob.id}/applicants/${rescreenApplicant.id}/rescreen`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      }

      if (!response.ok) {
        const errMsg = data?.detail || `Resume rescreening failed with status ${response.status}`;
        throw new Error(errMsg);
      }

      if (!data) {
        throw new Error('Received non-JSON response from server.');
      }

      // Update applicant in local state
      setApplicants((prev) => {
        const updated = prev.map((a) => (a.id === rescreenApplicant.id ? data : a));
        return updated.sort((a, b) => b.match_score - a.match_score);
      });

      // Update activeApplicant if they are current drawer
      if (activeApplicant && activeApplicant.id === rescreenApplicant.id) {
        setActiveApplicant(data);
      }

      setIsUploadModalOpen(false);
      setRescreenApplicant(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRescreenTrigger = (applicant) => {
    setRescreenApplicant(applicant);
    setIsUploadModalOpen(true);
  };

  const handleSelectApplicant = (applicant) => {
    setActiveApplicant(applicant);
    setIsDrawerOpen(true);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to reset password.');
      }

      setResetSuccess(data.message);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setResetError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setResetToken(null);
    setResetError(null);
    setResetSuccess(null);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  // Intercept for password reset view if token is present in URL
  if (resetToken) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h2>Smart Resume Screener</h2>
            <p>Enter your new password below</p>
          </div>

          {resetError && <div className="error-message">{resetError}</div>}
          {resetSuccess && <div className="success-message">{resetSuccess}</div>}

          {!resetSuccess ? (
            <form onSubmit={handleResetPasswordSubmit}>
              <div className="form-group">
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm New Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <button 
              type="button" 
              className="back-login-btn"
              onClick={handleBackToLogin}
            >
              Go to Log In
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render Login screen if not authenticated
  if (!token || !user) {
    return <Login apiBaseUrl={API_URL} onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app">
      <nav className="nav-bar">
        <div className="user-badge">
          <span className="user-name">{user.name || user.email}</span>
        </div>
        <button type="button" className="logout-btn" onClick={handleManualLogout}>
          Log Out
        </button>
      </nav>

      {!activeJob ? (
        // Jobs Dashboard view
        <div className="app-content">
          <header className="app-header">
            <div className="header-content">
              <h1>Smart Resume Screener</h1>
              <p>Post job positions and screen candidate resumes using AI analytics.</p>
            </div>
          </header>

          <JobList
            jobs={jobs}
            onSelectJob={handleSelectJob}
            onCreateJobClick={() => setIsNewJobModalOpen(true)}
            isLoading={jobsLoading}
          />
        </div>
      ) : (
        // Job Details and Candidates view
        <div className="job-details-container">
          <div className="details-header">
            <div className="header-left">
              <button type="button" className="back-link" onClick={() => setActiveJob(null)}>
                ← Back to Dashboard
              </button>
              <h2>{activeJob.title}</h2>
              <div className="job-badges">
                {activeJob.department && <span className="badge">{activeJob.department}</span>}
                {activeJob.location && <span className="badge">{activeJob.location}</span>}
                {activeJob.employment_type && (
                  <span className="badge employment-type">
                    {activeJob.employment_type}
                  </span>
                )}
              </div>
            </div>
            
            <div className="header-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingJob(activeJob);
                  setIsNewJobModalOpen(true);
                }}
                style={{ marginRight: '8px' }}
              >
                Edit Position
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDeleteJob(activeJob.id)}
              >
                Delete Position
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setRescreenApplicant(null);
                  setIsUploadModalOpen(true);
                }}
              >
                Screen Candidate
              </button>
            </div>
          </div>

          <div className="job-desc-section">
            <h4>Job Description</h4>
            <p className="job-desc-text">{activeJob.description}</p>
            {activeJob.priority_skills && (
              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#cbd5e1' }}>Priority Skills</h4>
                <div className="priority-skills-container">
                  {activeJob.priority_skills.split(',').map((skill, idx) => (
                    <span key={idx} className="priority-skill-badge">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="applicants-section">
            <h4>Screened Candidates</h4>
            {error && (
              <div className="error-banner" style={{ marginBottom: '16px' }}>
                <strong>Error:</strong> {error}
              </div>
            )}
            
            {applicants.length === 0 ? (
              <div className="empty-applicants">
                <p>No candidates have been screened for this position yet.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setIsUploadModalOpen(true)}
                >
                  Screen First Candidate
                </button>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="applicants-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Score</th>
                      <th>Filename</th>
                      <th>Date Screened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicants.map((app) => {
                      const scoreClass = app.match_score >= 80 ? 'excellent' : app.match_score >= 60 ? 'good' : 'poor';
                      return (
                        <tr
                          key={app.id}
                          className="applicant-row"
                          onClick={() => handleSelectApplicant(app)}
                        >
                          <td>
                            <div className="candidate-name-cell">{app.name || 'Unknown Candidate'}</div>
                            <div className="candidate-email-cell">{app.email}</div>
                          </td>
                          <td>
                            <span className={`score-badge-pill ${scoreClass}`}>
                              {app.match_score}%
                            </span>
                          </td>
                          <td>{app.resume_filename}</td>
                          <td>{new Date(app.created_at).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals & Drawer */}
      {isNewJobModalOpen && (
        <NewJobModal
          onClose={() => {
            setIsNewJobModalOpen(false);
            setEditingJob(null);
          }}
          onSubmit={editingJob ? (jobData) => handleEditJob(editingJob.id, jobData) : handleCreateJob}
          loading={loading}
          job={editingJob}
        />
      )}

      {isUploadModalOpen && (
        <UploadApplicantModal
          onClose={() => {
            setIsUploadModalOpen(false);
            setRescreenApplicant(null);
            setUploadProgress(null);
          }}
          onSubmit={rescreenApplicant ? (files) => handleRescreenApplicant(files[0]) : handleScreenResume}
          loading={loading}
          candidateEmail={rescreenApplicant ? rescreenApplicant.email : ''}
          uploadProgress={uploadProgress}
        />
      )}

      <AnalysisDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        applicant={activeApplicant}
        onRescreen={handleRescreenTrigger}
      />
    </div>
  );
}

export default App;
