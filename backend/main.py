import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from extractor import extract_text
from screener import screen_resume

load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(title="Smart Resume Screener")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/screen")
async def screen(
    job_description: str = Form(...),
    resume_file: UploadFile = File(...),
):
    if not job_description.strip():
        return JSONResponse(
            status_code=400,
            content={"error": "Job description is required."},
        )

    if not resume_file.filename:
        return JSONResponse(
            status_code=400,
            content={"error": "Resume file is required."},
        )

    filename = resume_file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        return JSONResponse(
            status_code=400,
            content={"error": "Resume must be a .pdf or .txt file."},
        )

    try:
        file_bytes = await resume_file.read()
        resume_text = extract_text(resume_file.filename, file_bytes)
        result = screen_resume(job_description, resume_text)
        return result
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except RuntimeError as exc:
        return JSONResponse(status_code=502, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": f"An unexpected error occurred: {exc}"},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
