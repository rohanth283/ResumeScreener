import { useState } from 'react';
import './NewJobModal.css';

export default function NewJobModal({ onClose, onSubmit, loading, job = null }) {
  const [title, setTitle] = useState(job ? job.title : '');
  const [department, setDepartment] = useState(job ? (job.department || '') : '');
  const [location, setLocation] = useState(job ? (job.location || '') : '');
  const [employmentType, setEmploymentType] = useState(job ? (job.employment_type || 'Full-time') : 'Full-time');
  const [description, setDescription] = useState(job ? job.description : '');
  const [prioritySkills, setPrioritySkills] = useState(job ? (job.priority_skills || '') : '');
  const [status, setStatus] = useState(job ? (job.status || 'open') : 'open');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    onSubmit({
      title: title.trim(),
      department: department.trim() || null,
      location: location.trim() || null,
      employment_type: employmentType,
      description: description.trim(),
      priority_skills: prioritySkills.trim() || null,
      status: status,
    });
  };

  const isFormValid = title.trim() && description.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{job ? 'Edit Job Position' : 'Create New Job'}</h3>
        <p>{job ? 'Modify the details of this job position.' : 'Post a new opening to start screening candidate resumes.'}</p>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field form-field-full">
              <label htmlFor="job-title">Job Title</label>
              <input
                id="job-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                required
                disabled={loading}
              />
            </div>

            <div className="form-field">
              <label htmlFor="job-dept">Department</label>
              <input
                id="job-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Engineering"
                disabled={loading}
              />
            </div>

            <div className="form-field">
              <label htmlFor="job-loc">Location</label>
              <input
                id="job-loc"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Remote / San Francisco, CA"
                disabled={loading}
              />
            </div>

            <div className="form-field form-field-full">
              <label htmlFor="job-type">Employment Type</label>
              <select
                id="job-type"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                disabled={loading}
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>

            {job && (
              <div className="form-field form-field-full">
                <label htmlFor="job-status">Recruitment Status</label>
                <select
                  id="job-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={loading}
                >
                  <option value="open">Ongoing (Active)</option>
                  <option value="closed">Completed (Closed)</option>
                </select>
              </div>
            )}

            <div className="form-field form-field-full">
              <label htmlFor="priority-skills">Priority Skills (comma-separated)</label>
              <input
                id="priority-skills"
                type="text"
                value={prioritySkills}
                onChange={(e) => setPrioritySkills(e.target.value)}
                placeholder="e.g. FastAPI, React, Python (gives these extra weight in matching)"
                disabled={loading}
              />
            </div>

            <div className="form-field form-field-full">
              <label htmlFor="job-desc">Job Description</label>
              <textarea
                id="job-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste the full job description and requirements here..."
                rows={6}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn create"
              disabled={!isFormValid || loading}
            >
              {job ? (loading ? 'Saving...' : 'Save Changes') : (loading ? 'Creating...' : 'Create Job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
