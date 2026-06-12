import './JobList.css';

export default function JobList({ jobs, onSelectJob, onCreateJobClick }) {
  return (
    <div className="job-dashboard">
      <div className="dashboard-header">
        <h2>Active Positions</h2>
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
              <h3>{job.title}</h3>
              <div className="job-badges">
                {job.department && <span className="badge">{job.department}</span>}
                {job.location && <span className="badge">{job.location}</span>}
                {job.employment_type && (
                  <span className="badge employment-type">
                    {job.employment_type}
                  </span>
                )}
              </div>
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
