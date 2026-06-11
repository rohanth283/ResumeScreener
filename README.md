# Smart Resume Screener

A web application that lets recruiters paste a job description, upload a resume (PDF or TXT), and instantly receive an AI-generated match report with a score, summary, strengths, and improvement areas.

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Python + FastAPI
- **AI:** Google Gemini (AI Studio)
- **PDF parsing:** pdfplumber

## Project Structure

```
smart-resume-screener/
├── backend/
│   ├── main.py          # FastAPI app + /screen endpoint
│   ├── extractor.py     # PDF & TXT text extraction
│   ├── screener.py      # Prompt builder + LLM call + JSON parser
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── UploadForm.jsx
│   │       └── ScoreCard.jsx
│   └── package.json
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- A [Google AI Studio API key](https://aistudio.google.com/apikey)

## Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:

   ```bash
   python3 -m venv venv
   source venv/bin/activate        # macOS / Linux
   # venv\Scripts\activate         # Windows
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Configure your API key. Copy the example env file and add your key:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Gemini API key:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).

   You can also export the key as an environment variable instead of using `.env`:

   ```bash
   export GEMINI_API_KEY=your_key_here
   ```

5. Start the backend server:

   ```bash
   uvicorn main:app --reload
   ```

   The API will be available at [http://localhost:8000](http://localhost:8000).  
   Health check: [http://localhost:8000/health](http://localhost:8000/health)

## Frontend Setup

1. Open a new terminal and navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm start
   ```

   The app will open at [http://localhost:3000](http://localhost:3000).

## Usage

1. Paste a job description into the text area.
2. Upload a resume file (`.pdf` or `.txt`).
3. Click **Screen Resume**.
4. View the match score, summary, strengths, and improvement areas.

## API

### `POST /screen`

Accepts `multipart/form-data`:

| Field             | Type   | Description              |
|-------------------|--------|--------------------------|
| `job_description` | string | Full job description     |
| `resume_file`     | file   | Resume (`.pdf` or `.txt`) |

**Success response (200):**

```json
{
  "match_score": 82,
  "summary": "Two-sentence overall assessment.",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"]
}
```

**Error response:**

```json
{
  "error": "Clear error message"
}
```

## Deployment

### Backend (e.g. Render, Railway, Fly.io)

1. Deploy the `backend/` directory.
2. Set `GEMINI_API_KEY` as an environment variable.
3. Set the start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Update CORS origins in `main.py` to include your frontend URL.

### Frontend (e.g. Vercel, Netlify)

1. Deploy the `frontend/` directory.
2. Set `VITE_API_URL` to your deployed backend URL.
3. Build command: `npm run build`
4. Output directory: `dist`

### Public Deployment URLs

| Service  | URL |
|----------|-----|
| Frontend | _Deploy and add your URL here_ |
| Backend  | _Deploy and add your URL here_ |

## License

MIT
