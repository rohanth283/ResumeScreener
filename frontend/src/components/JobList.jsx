import './JobList.css';

export default function JobList({ jobs, onSelectJob, onCreateJobClick, isLoading }) {
  if (isLoading) {
    return (
      <div className="job-dashboard">
        <div className="dashboard-header">
          <h2>Active Positions</h2>
          <button type="button" className="add-job-btn" disabled>
            Create Job
          </button>
        </div>

        <div className="jobs-grid">
          {[1, 2, 3].map((n) => (
            <div key={n} className="job-card skeleton">
              <div className="job-card-top">
                <div className="skeleton-text skeleton-title"></div>
                <div className="job-badges">
                  <div className="skeleton-text skeleton-badge" style={{ width: '80px' }}></div>
                  <div className="skeleton-text skeleton-badge" style={{ width: '60px' }}></div>
                  <div className="skeleton-text skeleton-badge" style={{ width: '70px' }}></div>
                </div>
              </div>
              <div className="job-card-bottom">
                <div className="skeleton-text skeleton-count" style={{ width: '90px', height: '20px' }}></div>
                <div className="skeleton-text skeleton-link" style={{ width: '80px', height: '16px' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="job-dashboard">
      <div className="dashboard-header">
        <h2>Job Positions</h2>
        <button type="button" className="add-job-btn" onClick={onCreateJobClick}>
          Create Job
        </button>
      </div>

      <div className="jobs-grid">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="job-card"
            onClick={() => onSelectJob(job)}
          >
            <div className="job-card-top">
              <div className="job-card-title-row">
                <h3>{job.title}</h3>
                <span className={`status-badge ${job.status || 'active'}`}>
                  {job.status === 'closed' ? 'Closed' : 'Active'}
                </span>
              </div>
              <div className="job-badges">
                {job.department && <span className="badge">{job.department}</span>}
                {job.location && <span className="badge">{job.location}</span>}
                {job.employment_type && (
                  <span className="badge employment-type">
                    {job.employment_type}
                  </span>
                )}
              </div>
              {job.status === 'closed' && job.hired_applicant_name && (
                <div className="hired-badge">
                  🎉 Hired: <strong>{job.hired_applicant_name}</strong>
                </div>
              )}
            </div>
            
            <div className="job-card-bottom">
              <div className="candidate-count">
                <span className="count-number">{job.applicant_count || 0}</span>
                <span>{job.applicant_count === 1 ? 'Applicant' : 'Applicants'}</span>
              </div>
              <span className="view-link">View Details →</span>
            </div>
          </div>
        ))}

        {/* Create Job Empty State Card */}
        <div className="job-card create-card" onClick={onCreateJobClick}>
          <div className="create-card-content">
            <span className="plus-icon">+</span>
            <h4>Post a New Job</h4>
            <p>Add a new job description to begin screening resumes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
