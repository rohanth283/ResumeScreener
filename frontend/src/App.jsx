import { useState, useEffect, useMemo } from 'react';
import Login from './components/Login';
import JobList from './components/JobList';
import NewJobModal from './components/NewJobModal';
import UploadApplicantModal from './components/UploadApplicantModal';
import AnalysisDrawer from './components/AnalysisDrawer';
import EmailTemplateDrawer from './components/EmailTemplateDrawer';
import DatePicker from './components/DatePicker';
import {
  MoonIcon,
  SunIcon,
  UsersIcon,
  MailIcon,
  BriefcaseIcon,
  CheckIcon,
  FlagIcon
} from './components/Icons';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/_/backend' : 'http://localhost:8000');

const ensureUtcDate = (dateVal) => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  const dateStr = String(dateVal);
  if (dateStr.includes('T') && !dateStr.endsWith('Z')) {
    const parts = dateStr.split('T');
    const timePart = parts[1];
    if (!timePart.includes('+') && !timePart.includes('-')) {
      return new Date(dateStr + 'Z');
    }
  }
  return new Date(dateStr);
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [activeApplicant, setActiveApplicant] = useState(null);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);

  // Sorting states
  const [sortBy, setSortBy] = useState('score'); // 'score', 'name', 'date'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'

  // Sort applicants dynamically
  const sortedApplicants = useMemo(() => {
    return [...applicants].sort((a, b) => {
      let valA, valB;
      if (sortBy === 'name') {
        valA = (a.name || '').toLowerCase();
        valB = (b.name || '').toLowerCase();
      } else if (sortBy === 'date') {
        valA = new Date(a.created_at || 0).getTime();
        valB = new Date(b.created_at || 0).getTime();
      } else { // default 'score'
        valA = a.match_score || 0;
        valB = b.match_score || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [applicants, sortBy, sortOrder]);

  // Entire Candidate List States
  const [showAllApplicants, setShowAllApplicants] = useState(false);
  const [allApplicants, setAllApplicants] = useState([]);
  const [allApplicantsLoading, setAllApplicantsLoading] = useState(false);
  const [selectedDept, setSelectedDept] = useState('');
  const [searchName, setSearchName] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Unique departments for filtering
  const uniqueDepartments = useMemo(() => {
    const depts = new Set();
    allApplicants.forEach(app => {
      if (app.job_department) {
        depts.add(app.job_department.trim());
      }
    });
    return Array.from(depts).sort();
  }, [allApplicants]);

  // Unique positions for filtering
  const uniquePositions = useMemo(() => {
    const titles = new Set();
    allApplicants.forEach(app => {
      if (app.job_title) {
        titles.add(app.job_title.trim());
      }
    });
    return Array.from(titles).sort();
  }, [allApplicants]);

  // Filtered all applicants dynamically
  const filteredAllApplicants = useMemo(() => {
    return allApplicants.filter(app => {
      // 1. Department filter
      if (selectedDept && (app.job_department || '').trim().toLowerCase() !== selectedDept.trim().toLowerCase()) {
        return false;
      }
      // 2. Name filter
      if (searchName && !(app.name || '').toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }
      // 3. Position filter
      if (selectedPosition && (app.job_title || '').trim().toLowerCase() !== selectedPosition.trim().toLowerCase()) {
        return false;
      }
      // 4. Date filter (screened on or after selected date)
      if (filterDate) {
        const appDate = ensureUtcDate(app.created_at);
        const filterTarget = new Date(filterDate + 'T00:00:00Z');
        if (appDate) {
          const appDateMidnight = new Date(Date.UTC(appDate.getUTCFullYear(), appDate.getUTCMonth(), appDate.getUTCDate()));
          if (appDateMidnight < filterTarget) {
            return false;
          }
        } else {
          return false;
        }
      }
      return true;
    });
  }, [allApplicants, selectedDept, searchName, selectedPosition, filterDate]);

  // Modals & Drawer State
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEmailDrawerOpen, setIsEmailDrawerOpen] = useState(false);

  const [editingJob, setEditingJob] = useState(null);
  const [rescreenApplicant, setRescreenApplicant] = useState(null);
  
  // Alt Match recommendations modal state
  const [altMatchModalData, setAltMatchModalData] = useState(null);
  const [altMatchScreening, setAltMatchScreening] = useState(false);

  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(() => !!localStorage.getItem('auth_token'));
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);

  // Email history states
  const [activeTab, setActiveTab] = useState('candidates'); // 'candidates' or 'emails'
  const [emailsHistory, setEmailsHistory] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [expandedEmailJobIds, setExpandedEmailJobIds] = useState([]);

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

  const fetchApplicants = async (jobId, initialCount = 1) => {
    if (initialCount > 0) {
      setApplicantsLoading(true);
    } else {
      setApplicantsLoading(false);
    }
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
    } finally {
      setApplicantsLoading(false);
    }
  };

  const fetchAllApplicants = async () => {
    setAllApplicantsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/applicants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load candidate list.');
      const data = await response.json();
      setAllApplicants(data);
    } catch (err) {
      console.error(err.message);
      setError(err.message);
    } finally {
      setAllApplicantsLoading(false);
    }
  };

  const handleViewAllCandidates = () => {
    setShowAllApplicants(true);
    setSelectedDept('');
    setSearchName('');
    setSelectedPosition('');
    setFilterDate('');
    fetchAllApplicants();
  };

  const handleBackToDashboard = () => {
    setShowAllApplicants(false);
    setActiveJob(null);
  };

  const handleSwitchToJobApplicant = async (targetJobId, targetApplicantId) => {
    const targetJob = jobs.find(j => j.id === targetJobId);
    if (!targetJob) return;

    setIsDrawerOpen(false);
    setActiveApplicant(null);

    setActiveJob(targetJob);
    setApplicants([]);
    setSelectedApplicantIds([]);
    setActiveTab('candidates');
    setExpandedEmailJobIds([]);
    setApplicantsLoading(true);

    try {
      const response = await fetch(`${API_URL}/jobs/${targetJobId}/applicants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load applicants.');
      const data = await response.json();
      setApplicants(data);
      
      const targetApp = data.find(a => a.id === targetApplicantId);
      if (targetApp) {
        setActiveApplicant(targetApp);
        setIsDrawerOpen(true);
      }
    } catch (err) {
      console.error(err.message);
    } finally {
      setApplicantsLoading(false);
    }
  };

  const handleStartAlternativeScreen = async (applicant, targetJobId) => {
    setAltMatchScreening(true);
    try {
      const response = await fetch(`${API_URL}/jobs/${activeJob.id}/applicants/${applicant.id}/transfer-screen/${targetJobId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to screen candidate for alternative role.');
      const newApp = await response.json();
      
      // Update locally matched state
      setApplicants(prev => prev.map(a => {
        if (a.id === applicant.id) {
          return { ...a, best_alternative_is_screened: true };
        }
        return a;
      }));
      
      setAltMatchModalData(null);
      handleSwitchToJobApplicant(targetJobId, newApp.id);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setAltMatchScreening(false);
    }
  };

  const fetchEmailsHistory = async (jobId) => {
    setEmailsLoading(true);
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}/emails`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Failed to load email history.');
      const data = await response.json();
      setEmailsHistory(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setEmailsLoading(false);
    }
  };

  const handleCancelEmail = async (emailJobId) => {
    if (!window.confirm("Are you sure you want to cancel this scheduled email?")) return;
    const originalEmailsHistory = emailsHistory;
    
    // Optimistic UI update
    setEmailsHistory((prev) => prev.filter((email) => email.id !== emailJobId));
    
    try {
      const response = await fetch(`${API_URL}/jobs/${activeJob.id}/emails/${emailJobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        setEmailsHistory(originalEmailsHistory);
        handleLogout();
        return;
      }
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Could not cancel scheduled email.');
      }
    } catch (err) {
      // Rollback
      setEmailsHistory(originalEmailsHistory);
      alert(err.message);
    }
  };

  const handleToggleExpandEmailJob = (id) => {
    setExpandedEmailJobIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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
    setSelectedApplicantIds([]);
    setIsEmailDrawerOpen(false);
    setActiveTab('candidates');
    setEmailsHistory([]);
    setExpandedEmailJobIds([]);
    setAllApplicants([]);
    setShowAllApplicants(false);
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
    setApplicants([]);
    setSelectedApplicantIds([]);
    setActiveTab('candidates');
    setExpandedEmailJobIds([]);
    fetchApplicants(job.id, job.applicant_count || 0);
  };

  const handleToggleSelectApplicant = (id) => {
    setSelectedApplicantIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllApplicants = () => {
    if (selectedApplicantIds.length === applicants.length) {
      setSelectedApplicantIds([]);
    } else {
      setSelectedApplicantIds(applicants.map((app) => app.id));
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleDeselectAllApplicants = () => {
    setSelectedApplicantIds([]);
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

  const handleToggleJobStatus = async (job) => {
    const originalStatus = job.status || 'open';
    const newStatus = originalStatus === 'closed' ? 'open' : 'closed';
    
    // Optimistic UI update: instantly update local state so the badge and toggle button flip with 0ms delay
    const optimisticJob = { ...job, status: newStatus };
    setJobs((prev) => prev.map((j) => (j.id === job.id ? optimisticJob : j)));
    if (activeJob && activeJob.id === job.id) {
      setActiveJob(optimisticJob);
    }
    
    try {
      const response = await fetch(`${API_URL}/jobs/${job.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: job.title,
          department: job.department,
          location: job.location,
          employment_type: job.employment_type,
          description: job.description,
          priority_skills: job.priority_skills,
          status: newStatus
        }),
      });
      
      if (response.status === 401) {
        // Rollback state on auth error
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
        if (activeJob && activeJob.id === job.id) {
          setActiveJob(job);
        }
        handleLogout();
        return;
      }
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not update job status.');
      
      // Sync local state with actual server response data
      setJobs((prev) => prev.map((j) => (j.id === job.id ? data : j)));
      if (activeJob && activeJob.id === job.id) {
        setActiveJob(data);
      }
    } catch (err) {
      // Rollback state on network/API failure
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      if (activeJob && activeJob.id === job.id) {
        setActiveJob(job);
      }
      alert(err.message);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job and all of its applicants?')) return;
    const originalJobs = jobs;
    const originalActiveJob = activeJob;
    
    // Optimistic UI update: instantly remove from list and return to dashboard
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    if (activeJob && activeJob.id === jobId) {
      setActiveJob(null);
    }
    
    try {
      const response = await fetch(`${API_URL}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        setJobs(originalJobs);
        setActiveJob(originalActiveJob);
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Could not delete job.');
    } catch (err) {
      // Rollback state on error
      setJobs(originalJobs);
      setActiveJob(originalActiveJob);
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

    const initialCount = applicants.length;

    // Helper task to process a single file upload concurrently
    const processFile = async (file, index) => {
      // Update this file status to loading
      setUploadProgress((prev) => {
        const updated = [...prev.files];
        updated[index] = { ...updated[index], status: 'loading' };
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

        // Functional state update for applicants to avoid stale closures during concurrent requests
        setApplicants((prevApplicants) => {
          const isDuplicate = data.email && data.email.toLowerCase() !== "unknown@example.com"
            ? prevApplicants.some((a) => a.email && a.email.toLowerCase() === data.email.toLowerCase())
            : false;

          let updated;
          if (isDuplicate) {
            updated = prevApplicants.map((a) =>
              a.email && a.email.toLowerCase() === data.email.toLowerCase() ? data : a
            );
          } else {
            updated = [...prevApplicants, data];
          }
          return [...updated].sort((a, b) => b.match_score - a.match_score);
        });

        // Update activeApplicant if they are the current drawer
        setActiveApplicant((prevActive) => {
          if (prevActive && prevActive.email && data.email && prevActive.email.toLowerCase() === data.email.toLowerCase()) {
            return data;
          }
          return prevActive;
        });

        // Update this file status to success
        setUploadProgress((prev) => {
          const updated = [...prev.files];
          updated[index] = { ...updated[index], status: 'success' };
          return { files: updated };
        });
      } catch (err) {
        console.error(err.message);
        // Update this file status to error
        setUploadProgress((prev) => {
          const updated = [...prev.files];
          updated[index] = { ...updated[index], status: 'error', errorMsg: err.message };
          return { files: updated };
        });
      }
    };

    // Dispatch all requests concurrently
    await Promise.all(files.map((file, index) => processFile(file, index)));

    // Safely compute new applicants count and update the job counter using a functional updater
    setApplicants((currentApplicants) => {
      const addedCount = currentApplicants.length - initialCount;
      if (addedCount > 0) {
        setJobs((prev) => prev.map((j) => {
          if (j.id === activeJob.id) {
            return { ...j, applicant_count: (j.applicant_count || 0) + addedCount };
          }
          return j;
        }));
      }
      return currentApplicants;
    });

    setLoading(false);
  };

  const handleRescreenApplicant = async (resumeFile) => {
    if (!rescreenApplicant) return;
    setLoading(true);
    setError(null);
    const targetJobId = activeJob ? activeJob.id : rescreenApplicant.job_id;
    try {
      const formData = new FormData();
      formData.append('resume_file', resumeFile);

      const response = await fetch(`${API_URL}/jobs/${targetJobId}/applicants/${rescreenApplicant.id}/rescreen`, {
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
      
      setAllApplicants((prev) => prev.map((a) => (a.id === rescreenApplicant.id ? { ...data, job_title: a.job_title, job_department: a.job_department } : a)));

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

  const handleToggleReview = async (applicant) => {
    // Optimistic UI Update: Toggle status instantly
    const originalStatus = applicant.is_reviewed || false;
    const optimisticStatus = !originalStatus;
    const optimisticApplicant = { ...applicant, is_reviewed: optimisticStatus };

    setApplicants((prev) => prev.map((a) => (a.id === applicant.id ? optimisticApplicant : a)));
    setAllApplicants((prev) => prev.map((a) => (a.id === applicant.id ? optimisticApplicant : a)));
    if (activeApplicant && activeApplicant.id === applicant.id) {
      setActiveApplicant(optimisticApplicant);
    }

    const targetJobId = activeJob ? activeJob.id : applicant.job_id;
    const originalAllApplicants = allApplicants;

    try {
      const response = await fetch(`${API_URL}/jobs/${targetJobId}/applicants/${applicant.id}/review`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401) {
        // Rollback state on auth error
        setApplicants((prev) => prev.map((a) => (a.id === applicant.id ? applicant : a)));
        setAllApplicants(originalAllApplicants);
        if (activeApplicant && activeApplicant.id === applicant.id) {
          setActiveApplicant(applicant);
        }
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Could not update candidate review status.');
      const data = await response.json();

      // Ensure sync with server data
      setApplicants((prev) => prev.map((a) => (a.id === applicant.id ? data : a)));
      setAllApplicants((prev) => prev.map((a) => (a.id === applicant.id ? { ...data, job_title: a.job_title, job_department: a.job_department } : a)));
      if (activeApplicant && activeApplicant.id === applicant.id) {
        setActiveApplicant(data);
      }
    } catch (err) {
      // Rollback state on network/API failure
      setApplicants((prev) => prev.map((a) => (a.id === applicant.id ? applicant : a)));
      setAllApplicants(originalAllApplicants);
      if (activeApplicant && activeApplicant.id === applicant.id) {
        setActiveApplicant(applicant);
      }
      alert(err.message);
    }
  };

  const handleDeleteApplicant = async (applicant) => {
    if (!window.confirm(`Are you sure you want to permanently delete candidate ${applicant.name || 'this candidate'}?`)) {
      return;
    }
    
    // Save original state references
    const originalApplicants = applicants;
    const originalAllApplicants = allApplicants;
    const originalJobs = jobs;
    const originalActiveJob = activeJob;
    const originalSelectedApplicantIds = selectedApplicantIds;
    const originalActiveApplicant = activeApplicant;
    const originalIsDrawerOpen = isDrawerOpen;
    
    // Optimistic UI updates: instantly remove from state
    setApplicants((prev) => prev.filter((a) => a.id !== applicant.id));
    setAllApplicants((prev) => prev.filter((a) => a.id !== applicant.id));
    
    setJobs((prevJobs) => 
      prevJobs.map((j) => 
        j.id === applicant.job_id ? { ...j, applicant_count: Math.max(0, (j.applicant_count || 0) - 1) } : j
      )
    );
    if (activeJob && activeJob.id === applicant.job_id) {
      setActiveJob((prevJob) => 
        prevJob ? { ...prevJob, applicant_count: Math.max(0, (prevJob.applicant_count || 0) - 1) } : null
      );
    }
    
    setSelectedApplicantIds((prev) => prev.filter((id) => id !== applicant.id));
    
    if (activeApplicant && activeApplicant.id === applicant.id) {
      setIsDrawerOpen(false);
      setActiveApplicant(null);
    }
    
    try {
      const response = await fetch(`${API_URL}/jobs/${applicant.job_id}/applicants/${applicant.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401) {
        // Rollback
        setApplicants(originalApplicants);
        setAllApplicants(originalAllApplicants);
        setJobs(originalJobs);
        setActiveJob(originalActiveJob);
        setSelectedApplicantIds(originalSelectedApplicantIds);
        setActiveApplicant(originalActiveApplicant);
        setIsDrawerOpen(originalIsDrawerOpen);
        handleLogout();
        return;
      }
      if (!response.ok) throw new Error('Could not delete candidate.');
    } catch (err) {
      // Rollback
      setApplicants(originalApplicants);
      setAllApplicants(originalAllApplicants);
      setJobs(originalJobs);
      setActiveJob(originalActiveJob);
      setSelectedApplicantIds(originalSelectedApplicantIds);
      setActiveApplicant(originalActiveApplicant);
      setIsDrawerOpen(originalIsDrawerOpen);
      alert(err.message);
    }
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
    return (
      <>
        <button 
          type="button" 
          className="theme-toggle-btn"
          onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        </button>
        <Login apiBaseUrl={API_URL} onAuthSuccess={handleAuthSuccess} />
      </>
    );
  }

  return (
    <div className="app">
      <button 
        type="button" 
        className="theme-toggle-btn"
        onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
        {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
      </button>
      <nav className="nav-bar">
        <div className="user-badge">
          <span className="user-name">{user.name || user.email}</span>
        </div>
        <button type="button" className="logout-btn" onClick={handleManualLogout}>
          Log Out
        </button>
      </nav>

      {!activeJob ? (
        showAllApplicants ? (
          // Entire Candidate List view
          <div className="job-details-container all-candidates-container">
            <div className="details-header">
              <div className="header-left">
                <button type="button" className="back-link" onClick={handleBackToDashboard}>
                  ← Back to Dashboard
                </button>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  Entire Candidate List
                  <span className="badge" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
                    {filteredAllApplicants.length} Screened
                  </span>
                </h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                  View and filter all candidates who have applied across all positions.
                </p>
              </div>
            </div>

            <div className="filter-bar">
              <div className="filter-group">
                <span className="filter-label">Search Name:</span>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Type to search..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
              
              <div className="filter-group">
                <span className="filter-label">Department:</span>
                <select
                  className="filter-select"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {uniqueDepartments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <span className="filter-label">Position:</span>
                <select
                  className="filter-select"
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                >
                  <option value="">All Positions</option>
                  {uniquePositions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">Screened Since:</span>
                <DatePicker
                  value={filterDate}
                  onChange={setFilterDate}
                  placeholder="Select Date"
                />
              </div>
            </div>

            <div className="applicants-section" style={{ marginTop: '24px' }}>
              {error && (
                <div className="error-banner" style={{ marginBottom: '16px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
              
              {allApplicantsLoading ? (
                <div className="applicants-loading">
                  <span className="loading-spinner" />
                  <p>Loading candidate list...</p>
                </div>
              ) : filteredAllApplicants.length === 0 ? (
                <div className="empty-applicants">
                  <p>No candidates match the selected criteria.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="applicants-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        <th style={{ width: '45px', textAlign: 'center' }}><FlagIcon size={14} /></th>
                        <th>Candidate</th>
                        <th>Position</th>
                        <th>Department</th>
                        <th>Score</th>
                        <th>Filename</th>
                        <th>Date Screened</th>
                        <th>Best Alternate Fit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAllApplicants.map((app, index) => {
                        const scoreClass = app.match_score >= 80 ? 'excellent' : app.match_score >= 60 ? 'good' : 'poor';
                        return (
                          <tr
                            key={app.id}
                            className="applicant-row"
                            onClick={() => handleSelectApplicant(app)}
                          >
                            <td style={{ textAlign: 'center', fontWeight: '500', color: 'var(--text-muted)' }}>
                              {index + 1}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={`list-flag-btn ${app.is_reviewed ? 'flagged' : ''}`}
                                onClick={() => handleToggleReview(app)}
                                title={app.is_reviewed ? "Marked as Reviewed" : "Mark as Reviewed"}
                              >
                                <FlagIcon size={14} fill={app.is_reviewed ? 'currentColor' : 'none'} />
                              </button>
                            </td>
                            <td>
                              <div className="candidate-name-cell">
                                {app.name || 'Unknown Candidate'}
                                {app.is_reviewed && (
                                  <span className="reviewed-checkmark-badge flex-icon-align" title="Manually Audited & Reviewed">
                                    <CheckIcon size={10} /> Reviewed
                                  </span>
                                )}
                              </div>
                              <div className="candidate-email-cell">{app.email}</div>
                            </td>
                            <td style={{ fontWeight: '500' }}>{app.job_title || 'Unknown Position'}</td>
                            <td>
                              <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
                                {app.job_department || '—'}
                              </span>
                            </td>
                            <td>
                              <span className={`score-badge-pill ${scoreClass}`}>
                                {app.match_score}%
                              </span>
                            </td>
                            <td>{app.resume_filename}</td>
                            <td>{ensureUtcDate(app.created_at).toLocaleDateString()}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {app.best_alternative_job_title ? (
                                <button
                                  type="button"
                                  className={`alt-match-pill-btn ${app.best_alternative_is_screened ? 'screened' : ''}`}
                                  title="View alternative position match details"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAltMatchModalData(app);
                                  }}
                                >
                                  <BriefcaseIcon size={12} style={{ marginRight: '4px' }} /> Different Match
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
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
              onViewAllCandidatesClick={handleViewAllCandidates}
              isLoading={jobsLoading}
            />
          </div>
        )
      ) : (
        // Job Details and Candidates view
        <div className="job-details-container">
          <div className="details-header">
            <div className="header-left">
              <button type="button" className="back-link" onClick={() => setActiveJob(null)}>
                ← Back to Dashboard
              </button>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {activeJob.title}
                <span className={`badge ${activeJob.status === 'closed' ? 'status-completed' : 'status-ongoing'}`}>
                  {activeJob.status === 'closed' ? 'Completed' : 'Ongoing'}
                </span>
              </h2>
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
                onClick={() => handleToggleJobStatus(activeJob)}
                style={{ marginRight: '8px' }}
              >
                {activeJob.status === 'closed' ? 'Mark as Ongoing' : 'Mark as Completed'}
              </button>
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

          <div className="tab-navigation">
            <button
              type="button"
              className={`tab-button ${activeTab === 'candidates' ? 'active' : ''} flex-icon-align`}
              onClick={() => setActiveTab('candidates')}
              style={{ justifyContent: 'center' }}
            >
              <UsersIcon size={14} /> Candidates
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'emails' ? 'active' : ''} flex-icon-align`}
              onClick={() => {
                setActiveTab('emails');
                fetchEmailsHistory(activeJob.id);
              }}
              style={{ justifyContent: 'center' }}
            >
              <MailIcon size={14} /> Email History
            </button>
          </div>

          {activeTab === 'candidates' ? (
            <div className="applicants-section">
              <div className="applicants-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <h4 style={{ margin: 0 }}>Screened Candidates</h4>
                  {applicants.length > 0 && (
                    <div className="sort-control-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      <span>Sort:</span>
                      <select
                        value={`${sortBy}-${sortOrder}`}
                        onChange={(e) => {
                          const [field, order] = e.target.value.split('-');
                          setSortBy(field);
                          setSortOrder(order);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        <option value="score-desc">Score: High to Low</option>
                        <option value="score-asc">Score: Low to High</option>
                        <option value="name-asc">Name: A to Z</option>
                        <option value="name-desc">Name: Z to A</option>
                        <option value="date-desc">Date Screened: Newest</option>
                        <option value="date-asc">Date Screened: Oldest</option>
                      </select>
                    </div>
                  )}
                </div>
                {selectedApplicantIds.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-primary email-selected-btn"
                      onClick={() => setIsEmailDrawerOpen(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <MailIcon size={14} /> Email Selected ({selectedApplicantIds.length})
                    </button>
                    <button
                      type="button"
                      className="btn-secondary deselect-all-btn"
                      onClick={handleDeselectAllApplicants}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      ✕ Deselect All
                    </button>
                  </div>
                )}
              </div>
              {error && (
                <div className="error-banner" style={{ marginBottom: '16px' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
              
              {applicantsLoading ? (
                <div className="applicants-loading">
                  <span className="loading-spinner" />
                  <p>Loading candidate analysis...</p>
                </div>
              ) : applicants.length === 0 ? (
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
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={applicants.length > 0 && selectedApplicantIds.length === applicants.length}
                            onChange={handleToggleSelectAllApplicants}
                          />
                        </th>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        <th style={{ width: '45px', textAlign: 'center' }}>
                          <FlagIcon size={14} />
                        </th>
                        <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }} className="sortable-header">
                          Candidate {sortBy === 'name' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', userSelect: 'none' }} className="sortable-header">
                          Score {sortBy === 'score' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th>Filename</th>
                        <th onClick={() => handleSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }} className="sortable-header">
                          Date Screened {sortBy === 'date' && (sortOrder === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        <th>Best Alternate Fit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedApplicants.map((app, index) => {
                        const scoreClass = app.match_score >= 80 ? 'excellent' : app.match_score >= 60 ? 'good' : 'poor';
                        return (
                          <tr
                            key={app.id}
                            className={`applicant-row ${selectedApplicantIds.includes(app.id) ? 'selected' : ''}`}
                            onClick={() => handleSelectApplicant(app)}
                          >
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedApplicantIds.includes(app.id)}
                                onChange={() => handleToggleSelectApplicant(app.id)}
                              />
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: '500', color: 'var(--text-muted)' }}>
                              {index + 1}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className={`list-flag-btn ${app.is_reviewed ? 'flagged' : ''}`}
                                onClick={() => handleToggleReview(app)}
                                title={app.is_reviewed ? "Marked as Reviewed" : "Mark as Reviewed"}
                              >
                                <FlagIcon size={14} fill={app.is_reviewed ? 'currentColor' : 'none'} />
                              </button>
                            </td>
                            <td>
                              <div className="candidate-name-cell">
                                {app.name || 'Unknown Candidate'}
                                {app.is_reviewed && (
                                  <span className="reviewed-checkmark-badge flex-icon-align" title="Manually Audited & Reviewed">
                                    <CheckIcon size={10} /> Reviewed
                                  </span>
                                )}
                              </div>
                              <div className="candidate-email-cell">{app.email}</div>
                            </td>
                            <td>
                              <span className={`score-badge-pill ${scoreClass}`}>
                                {app.match_score}%
                              </span>
                            </td>
                            <td>{app.resume_filename}</td>
                            <td>{ensureUtcDate(app.created_at).toLocaleDateString()}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {app.best_alternative_job_title ? (
                                <button
                                  type="button"
                                  className={`alt-match-pill-btn ${app.best_alternative_is_screened ? 'screened' : ''}`}
                                  title="View alternative position match details"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAltMatchModalData(app);
                                  }}
                                >
                                  <BriefcaseIcon size={12} style={{ marginRight: '4px' }} /> Different Match
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="emails-history-section">
              <div className="emails-section-header">
                <h4>Email History & Queues</h4>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fetchEmailsHistory(activeJob.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '13px' }}
                >
                  ↻ Refresh
                </button>
              </div>

              {emailsLoading ? (
                <div className="applicants-loading">
                  <span className="loading-spinner" />
                  <p>Loading email history...</p>
                </div>
              ) : emailsHistory.length === 0 ? (
                <div className="empty-applicants">
                  <p>No email outreach logs found for this position yet.</p>
                </div>
              ) : (
                <div className="emails-history-list">
                  {emailsHistory.map((job) => {
                    const isExpanded = expandedEmailJobIds.includes(job.id);
                    const formattedDate = job.send_at
                      ? ensureUtcDate(job.send_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'
                      : ensureUtcDate(job.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
                    const statusClass = job.status === 'sent' ? 'success' : job.status === 'pending' ? 'pending' : 'failed';
                    const statusLabel = job.status === 'pending' ? 'Scheduled' : job.status === 'sent' ? 'Sent' : job.status === 'partial_failed' ? 'Partial Success' : 'Failed';
                    
                    return (
                      <div key={job.id} className={`email-history-card ${isExpanded ? 'expanded' : ''}`}>
                        <div className="email-card-header" onClick={() => handleToggleExpandEmailJob(job.id)}>
                          <div className="card-header-left">
                            <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                            <span className="delivery-time">
                              {job.status === 'pending' ? 'Scheduled for: ' : 'Sent: '}{formattedDate}
                            </span>
                          </div>
                          <div className="card-header-right">
                            {job.status === 'pending' && (
                              <button
                                type="button"
                                className="cancel-schedule-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEmail(job.id);
                                }}
                              >
                                Cancel Schedule
                              </button>
                            )}
                            <span className="toggle-indicator">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        <div className="email-card-summary">
                          <div className="summary-field">
                            <span className="field-label">Subject:</span>
                            <span className="field-value text-truncate">{job.subject_template}</span>
                          </div>
                          <div className="summary-field">
                            <span className="field-label">Recipients:</span>
                            <span className="field-value">
                              {job.applicant_ids?.length || 0} candidate(s)
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="email-card-details">
                            <div className="details-group">
                              <h5>Subject Template</h5>
                              <div className="template-preview-box">{job.subject_template}</div>
                            </div>
                            
                            <div className="details-group">
                              <h5>Body Template</h5>
                              <pre className="template-preview-box body-preview">{job.body_template}</pre>
                            </div>

                            {job.error_message && (
                              <div className="error-banner" style={{ margin: '12px 0 0' }}>
                                <strong>Job Errors:</strong> {job.error_message}
                              </div>
                            )}

                            <div className="details-group">
                              <h5>Recipient Breakdown</h5>
                              <div className="recipients-breakdown-list">
                                {job.results && job.results.length > 0 ? (
                                  job.results.map((res, index) => (
                                    <div key={index} className="recipient-breakdown-row">
                                      <div className="recipient-info">
                                        <span className="recipient-email">{res.email}</span>
                                      </div>
                                      <div className="recipient-status">
                                        <span className={`status-pill ${res.status}`}>
                                          {res.status}
                                        </span>
                                        {res.error && (
                                          <span className="recipient-error" title={res.error}>
                                            ({res.error})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="recipients-pending-message">
                                    Status of individual dispatches will update after the email is sent.
                                    <br />
                                    Applicant IDs queued: {JSON.stringify(job.applicant_ids)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
        onToggleReview={handleToggleReview}
        onDelete={handleDeleteApplicant}
        onSwitchToApplicant={handleSwitchToJobApplicant}
        token={token}
        apiUrl={API_URL}
        jobId={activeJob ? activeJob.id : (activeApplicant ? activeApplicant.job_id : null)}
      />

      <EmailTemplateDrawer
        isOpen={isEmailDrawerOpen}
        onClose={() => setIsEmailDrawerOpen(false)}
        selectedApplicants={applicants.filter((app) => selectedApplicantIds.includes(app.id))}
        job={activeJob}
        token={token}
        apiUrl={API_URL}
        onSentComplete={() => {
          setIsEmailDrawerOpen(false);
          setSelectedApplicantIds([]);
          fetchApplicants(activeJob.id);
          fetchEmailsHistory(activeJob.id);
        }}
      />

      {altMatchModalData && (
        <div className="alt-match-modal-overlay" onClick={() => setAltMatchModalData(null)}>
          <div className="alt-match-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="alt-match-modal-header">
              <h3>Alternative Job Match Recommendation</h3>
              <button 
                type="button" 
                className="close-alt-modal-btn" 
                onClick={() => setAltMatchModalData(null)}
              >
                ✕
              </button>
            </div>
            <div className="alt-match-modal-body">
              <div className="alt-modal-candidate-row">
                <span className="alt-modal-label">Candidate Name:</span>
                <span className="alt-modal-val">{altMatchModalData.name || 'Unknown Candidate'}</span>
              </div>
              <div className="alt-modal-candidate-row">
                <span className="alt-modal-label">Email Address:</span>
                <span className="alt-modal-val">{altMatchModalData.email}</span>
              </div>
              
              <div className="alt-modal-divider" />
              
              <div className="alt-modal-recommended-card">
                <div className="alt-modal-rec-header">
                  <span className="alt-modal-rec-tag">🎯 Recommended Role</span>
                  <span className={`alt-match-badge ${altMatchModalData.best_alternative_score >= 80 ? 'high' : altMatchModalData.best_alternative_score >= 50 ? 'medium' : 'low'}`}>
                    {altMatchModalData.best_alternative_score}% Semantic Match
                  </span>
                </div>
                <div className="alt-modal-rec-title">{altMatchModalData.best_alternative_job_title}</div>
                <p className="alt-modal-rec-desc">
                  Based on AI vector analysis of the candidate's resume and your other open jobs, this candidate is an excellent fit for the <strong>{altMatchModalData.best_alternative_job_title}</strong> position.
                </p>
              </div>
            </div>
            
            <div className="alt-match-modal-footer">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setAltMatchModalData(null)}
              >
                Cancel
              </button>
              {altMatchModalData.best_alternative_is_screened ? (
                <button 
                  type="button" 
                  className="btn-primary"
                  onClick={() => {
                    const targetJobId = altMatchModalData.best_alternative_job_id;
                    const targetAppId = altMatchModalData.best_alternative_applicant_id;
                    setAltMatchModalData(null);
                    handleSwitchToJobApplicant(targetJobId, targetAppId);
                  }}
                >
                  View Existing Application
                </button>
              ) : (
                <button 
                  type="button" 
                  className="btn-primary"
                  disabled={altMatchScreening}
                  onClick={() => handleStartAlternativeScreen(altMatchModalData, altMatchModalData.best_alternative_job_id)}
                >
                  {altMatchScreening ? (
                    <>
                      <span className="loading-spinner mini" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                      Screening Candidate...
                    </>
                  ) : (
                    "Start Screening Process"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
