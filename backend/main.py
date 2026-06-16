import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables at the very beginning of application startup
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, File, Form, UploadFile, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import JWTError, jwt

from extractor import extract_text
from screener import screen_resume
import models
import schemas
import auth
from database import engine, get_db
from sqlalchemy import text

# Automatically initialize SQLite database tables
models.Base.metadata.create_all(bind=engine)

def run_migrations():
    with engine.begin() as conn:
        # 1. Ensure user_id exists in jobs
        try:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
            print("MIGRATION: Added user_id column to jobs table.")
        except Exception as e:
            print(f"MIGRATION INFO: Skip user_id column addition (likely already exists): {e}")

        # 2. Ensure is_reviewed exists in applicants
        try:
            conn.execute(text("ALTER TABLE applicants ADD COLUMN is_reviewed BOOLEAN DEFAULT FALSE"))
            print("MIGRATION: Added is_reviewed column to applicants table.")
        except Exception as e:
            print(f"MIGRATION INFO: Skip is_reviewed column addition (likely already exists): {e}")

        # 3. PostgreSQL Row-Level Security (RLS) configuration
        if not engine.url.drivername.startswith("sqlite"):
            try:
                # Enable and Force RLS on jobs
                conn.execute(text("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY"))
                conn.execute(text("ALTER TABLE jobs FORCE ROW LEVEL SECURITY"))
                
                # Enable and Force RLS on applicants
                conn.execute(text("ALTER TABLE applicants ENABLE ROW LEVEL SECURITY"))
                conn.execute(text("ALTER TABLE applicants FORCE ROW LEVEL SECURITY"))
                
                # Drop existing policies
                conn.execute(text("DROP POLICY IF EXISTS jobs_user_policy ON jobs"))
                conn.execute(text("DROP POLICY IF EXISTS applicants_user_policy ON applicants"))
                
                # Create jobs user policy matching the connection's session variable
                conn.execute(text(
                    "CREATE POLICY jobs_user_policy ON jobs "
                    "USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)"
                ))
                
                # Create applicants user policy checking if the job is accessible
                conn.execute(text(
                    "CREATE POLICY applicants_user_policy ON applicants "
                    "USING (job_id IN (SELECT id FROM jobs))"
                ))
                
                print("MIGRATION SUCCESS: Configured PostgreSQL Row-Level Security (RLS) policies.")
            except Exception as e:
                print(f"MIGRATION ERROR: Failed to configure PostgreSQL RLS: {e}")

run_migrations()

app = FastAPI(title="Smart Resume Screener")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# Authentication Dependency (SSO)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
        
    # Configure the session context user ID if it is a PostgreSQL database
    if not db.bind.url.drivername.startswith("sqlite"):
        db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user.id})
        
    return user


@app.get("/health")
async def health():
    return {"status": "ok"}


# Auth API Endpoints (Google & Email/Password SSO)
@app.post("/auth/signup", response_model=schemas.Token)
def signup(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered."
        )
    
    hashed_pwd = auth.get_password_hash(user_data.password)
    
    db_user = models.User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=hashed_pwd,
        role="Recruiter",
        auth_provider="local"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    access_token = auth.create_access_token(data={"sub": db_user.email, "role": db_user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": db_user
    }


@app.post("/auth/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user or user.auth_provider != "local" or not auth.verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.post("/auth/google", response_model=schemas.Token)
def google_auth(auth_data: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    try:
        id_info = auth.verify_google_token(auth_data.credential)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    
    email = id_info.get("email")
    name = id_info.get("name")
    
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        user = models.User(
            email=email,
            name=name,
            role="Recruiter",
            auth_provider="google"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.post("/auth/forgot-password")
def forgot_password(request_data: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request_data.email).first()
    # To prevent email harvesting, always return success even if user doesn't exist
    if user and user.auth_provider == "local":
        reset_token = auth.create_password_reset_token(user.email, user.hashed_password)
        auth.send_reset_email(user.email, reset_token)
    
    return {"message": "If the email is registered, a password reset link has been sent."}


@app.post("/auth/reset-password")
def reset_password(request_data: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(request_data.token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email = payload.get("sub")
        hash_suffix = payload.get("hash_suffix")
        purpose = payload.get("purpose")
        
        if not email or purpose != "reset-password" or hash_suffix is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or malformed reset token."
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The password reset link has expired."
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or user.auth_provider != "local":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or ineligible for password reset."
        )
        
    # Verify the token is not already used (check password hash suffix)
    current_suffix = user.hashed_password[-10:] if user.hashed_password else ""
    if hash_suffix != current_suffix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used or is invalid."
        )
        
    # Update password
    user.hashed_password = auth.get_password_hash(request_data.new_password)
    db.commit()
    return {"message": "Password reset successfully."}


# Job Management API Endpoints
@app.post("/jobs", response_model=schemas.JobResponse)
def create_job(
    job_data: schemas.JobCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_job = models.Job(
        user_id=current_user.id,
        title=job_data.title,
        department=job_data.department,
        location=job_data.location,
        employment_type=job_data.employment_type,
        description=job_data.description,
        priority_skills=job_data.priority_skills
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    # Newly created job has 0 applicants
    setattr(db_job, "applicant_count", 0)
    return db_job


@app.put("/jobs/{job_id}", response_model=schemas.JobResponse)
def update_job(
    job_id: int,
    job_data: schemas.JobCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this job."
        )
    
    job.title = job_data.title
    job.department = job_data.department
    job.location = job_data.location
    job.employment_type = job_data.employment_type
    job.description = job_data.description
    job.priority_skills = job_data.priority_skills
    
    db.commit()
    db.refresh(job)
    
    count = db.query(models.Applicant).filter(models.Applicant.job_id == job_id).count()
    setattr(job, "applicant_count", count)
    return job


@app.get("/jobs", response_model=list[schemas.JobResponse])
def get_jobs(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    jobs = db.query(models.Job).filter(models.Job.user_id == current_user.id).all()
    # Add applicant_count dynamically
    for job in jobs:
        count = db.query(models.Applicant).filter(models.Applicant.job_id == job.id).count()
        setattr(job, "applicant_count", count)
    return jobs


@app.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this job."
        )
    db.delete(job)
    db.commit()
    return {"message": "Job deleted successfully."}


# Applicant & Screening API Endpoints
@app.get("/jobs/{job_id}/applicants", response_model=list[schemas.ApplicantResponse])
def get_job_applicants(
    job_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job exists
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view applicants for this job."
        )
    
    # Return applicants sorted by match_score descending
    applicants = db.query(models.Applicant).filter(
        models.Applicant.job_id == job_id
    ).order_by(models.Applicant.match_score.desc()).all()
    
    return applicants


@app.post("/jobs/{job_id}/screen", response_model=schemas.ApplicantResponse)
async def screen_applicant_resume(
    job_id: int,
    email: str = Form(None),
    resume_file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Retrieve job description and priority skills from DB
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to screen applicants for this job."
        )

    # Validate file type
    filename = resume_file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume file must be a .pdf or .txt document."
        )

    try:
        # Extract text from file
        file_bytes = await resume_file.read()
        resume_text = extract_text(resume_file.filename, file_bytes)
        
        # Trigger Google Gemini AI matching with priority skills weighting
        screening_res = screen_resume(job.description, resume_text, job.priority_skills or "")
        
        # Use extracted email if not passed explicitly in form
        candidate_email = email.strip() if (email and email.strip()) else screening_res.get("candidate_email", "unknown@example.com")

        # Check if an applicant with this email is already screened for this job (exclude placeholder emails)
        existing_applicant = None
        if candidate_email and candidate_email.strip().lower() != "unknown@example.com":
            existing_applicant = db.query(models.Applicant).filter(
                models.Applicant.job_id == job_id,
                func.lower(models.Applicant.email) == candidate_email.strip().lower()
            ).first()

        if existing_applicant:
            # Update the existing record in-place to keep only one record per candidate
            existing_applicant.name = screening_res.get("candidate_name", "Unknown Candidate")
            existing_applicant.resume_filename = resume_file.filename
            existing_applicant.resume_text = resume_text
            existing_applicant.match_score = screening_res["match_score"]
            existing_applicant.summary = screening_res["summary"]
            existing_applicant.strengths = screening_res["strengths"]
            existing_applicant.improvements = screening_res["improvements"]
            existing_applicant.skills_matched = screening_res["skills_matched"]
            existing_applicant.skills_missing = screening_res["skills_missing"]
            existing_applicant.created_at = func.now() # update timestamp to show latest screening date
            
            db.commit()
            db.refresh(existing_applicant)
            return existing_applicant
        else:
            # Save results to SQL database
            applicant = models.Applicant(
                job_id=job_id,
                email=candidate_email,
                name=screening_res.get("candidate_name", "Unknown Candidate"),
                resume_filename=resume_file.filename,
                resume_text=resume_text,
                match_score=screening_res["match_score"],
                summary=screening_res["summary"],
                strengths=screening_res["strengths"],
                improvements=screening_res["improvements"],
                skills_matched=screening_res["skills_matched"],
                skills_missing=screening_res["skills_missing"]
            )
            db.add(applicant)
            db.commit()
            db.refresh(applicant)
            return applicant
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation failed: {exc}"
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {exc}"
        )


@app.put("/jobs/{job_id}/applicants/{applicant_id}/rescreen", response_model=schemas.ApplicantResponse)
async def rescreen_applicant_resume(
    job_id: int,
    applicant_id: int,
    resume_file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job and applicant exist
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to rescreen applicants for this job."
        )
        
    applicant = db.query(models.Applicant).filter(
        models.Applicant.id == applicant_id,
        models.Applicant.job_id == job_id
    ).first()
    if not applicant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate record not found."
        )

    # Validate file type
    filename = resume_file.filename.lower()
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume file must be a .pdf or .txt document."
        )

    try:
        # Extract text from file
        file_bytes = await resume_file.read()
        resume_text = extract_text(resume_file.filename, file_bytes)
        
        # Trigger Google Gemini AI matching with priority skills weighting
        screening_res = screen_resume(job.description, resume_text, job.priority_skills or "")
        
        # Update existing candidate record
        applicant.name = screening_res.get("candidate_name", "Unknown Candidate")
        applicant.resume_filename = resume_file.filename
        applicant.resume_text = resume_text
        applicant.match_score = screening_res["match_score"]
        applicant.summary = screening_res["summary"]
        applicant.strengths = screening_res["strengths"]
        applicant.improvements = screening_res["improvements"]
        applicant.skills_matched = screening_res["skills_matched"]
        applicant.skills_missing = screening_res["skills_missing"]
        
        db.commit()
        db.refresh(applicant)
        
        return applicant
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation failed: {exc}"
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {exc}"
        )
@app.put("/jobs/{job_id}/applicants/{applicant_id}/review", response_model=schemas.ApplicantResponse)
def toggle_applicant_review(
    job_id: int,
    applicant_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job ownership
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this candidate."
        )
        
    applicant = db.query(models.Applicant).filter(
        models.Applicant.id == applicant_id,
        models.Applicant.job_id == job_id
    ).first()
    if not applicant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate record not found."
        )
        
    # Toggle audited/reviewed status
    applicant.is_reviewed = not (applicant.is_reviewed or False)
    db.commit()
    db.refresh(applicant)
    return applicant


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
