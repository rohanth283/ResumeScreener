import { useState } from 'react';
import UploadForm from './components/UploadForm';
import ScoreCard from './components/ScoreCard';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/_/backend' : 'http://localhost:8000');

function App() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleScreen = async ({ jobDescription, resumeFile }) => {
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('job_description', jobDescription);
    formData.append('resume_file', resumeFile);

    try {
      const response = await fetch(`${API_URL}/screen`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Screening failed. Please try again.');
      }

      setResult(data);
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? `Could not reach the backend at ${API_URL}.`
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Smart Resume Screener</h1>
          <p>
            Paste a job description, upload a resume, and get an instant AI match
            report.
          </p>
        </div>
      </header>

      <main className="app-main">
        <UploadForm onSubmit={handleScreen} loading={loading} />
        {error && (
          <div className="error-banner" role="alert">
            <strong>Error:</strong> {error}
          </div>
        )}
        {result && <ScoreCard result={result} />}
      </main>
    </div>
  );
}

export default App;
