import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables at the very beginning of application startup
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, File, Form, UploadFile, Depends, HTTPException, status, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import JWTError, jwt
from typing import Optional

from extractor import extract_text
from screener import screen_resume, get_embedding, cosine_similarity
import anyio
import models
import schemas
import auth
from database import engine, get_db
from sqlalchemy import text

# Consolidate database initialization and migrations into a single transaction/connection block
def run_migrations():
    from sqlalchemy import inspect
    try:
        with engine.begin() as conn:
            inspector = inspect(conn)
            table_names = inspector.get_table_names()
            
            # Optimization: If running in serverless (Vercel) and database is already initialized,
            # we skip DDL column additions/RLS policies/indexes to achieve ultra-low cold start times.
            if os.getenv("VERCEL") == "1" and "users" in table_names:
                # Ensure description_embedding and status columns exist before skipping
                if "jobs" in table_names:
                    jobs_columns = [c["name"] for c in inspector.get_columns("jobs")]
                    if "description_embedding" in jobs_columns and "status" in jobs_columns:
                        print("MIGRATION: Skipping heavy startup DDL checks in serverless environment.")
                        return
            
            # 1. Initialize tables if empty
            if not table_names or "users" not in table_names:
                print("MIGRATION: Initializing database tables...")
                models.Base.metadata.create_all(bind=conn)
                # Re-inspect table names
                inspector = inspect(conn)
                table_names = inspector.get_table_names()

            # 2. Add columns if missing
            if "jobs" in table_names:
                columns = [c["name"] for c in inspector.get_columns("jobs")]
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                    print("MIGRATION: Added user_id column to jobs table.")
                if "description_embedding" not in columns:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN description_embedding JSON"))
                    print("MIGRATION: Added description_embedding column to jobs table.")
                if "status" not in columns:
                    conn.execute(text("ALTER TABLE jobs ADD COLUMN status VARCHAR DEFAULT 'open'"))
                    print("MIGRATION: Added status column to jobs table.")

            if "applicants" in table_names:
                columns = [c["name"] for c in inspector.get_columns("applicants")]
                if "is_reviewed" not in columns:
                    conn.execute(text("ALTER TABLE applicants ADD COLUMN is_reviewed BOOLEAN DEFAULT FALSE"))
                    print("MIGRATION: Added is_reviewed column to applicants table.")
                if "resume_pdf_bytes" not in columns:
                    col_type = "BLOB" if engine.url.drivername.startswith("sqlite") else "BYTEA"
                    conn.execute(text(f"ALTER TABLE applicants ADD COLUMN resume_pdf_bytes {col_type}"))
                    print(f"MIGRATION: Added resume_pdf_bytes column to applicants table ({col_type}).")
                if "resume_embedding" not in columns:
                    conn.execute(text("ALTER TABLE applicants ADD COLUMN resume_embedding JSON"))
                    print("MIGRATION: Added resume_embedding column to applicants table.")

            if "scheduled_emails" in table_names:
                columns = [c["name"] for c in inspector.get_columns("scheduled_emails")]
                if "results" not in columns:
                    conn.execute(text("ALTER TABLE scheduled_emails ADD COLUMN results JSON"))
                    print("MIGRATION: Added results column to scheduled_emails.")

            # 3. PostgreSQL RLS Configuration
            if not engine.url.drivername.startswith("sqlite"):
                conn.execute(text("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY"))
                conn.execute(text("ALTER TABLE jobs FORCE ROW LEVEL SECURITY"))
                conn.execute(text("ALTER TABLE applicants ENABLE ROW LEVEL SECURITY"))
                conn.execute(text("ALTER TABLE applicants FORCE ROW LEVEL SECURITY"))
                
                conn.execute(text("DROP POLICY IF EXISTS jobs_user_policy ON jobs"))
                conn.execute(text("DROP POLICY IF EXISTS applicants_user_policy ON applicants"))
                
                conn.execute(text(
                    "CREATE POLICY jobs_user_policy ON jobs "
                    "USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)"
                ))
                conn.execute(text(
                    "CREATE POLICY applicants_user_policy ON applicants "
                    "USING (job_id IN (SELECT id FROM jobs))"
                ))
                print("MIGRATION SUCCESS: Configured PostgreSQL Row-Level Security (RLS) policies.")

            # 4. Create database indexes for high-frequency queries
            if "jobs" in table_names:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id)"))
            if "applicants" in table_names:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants(job_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email)"))
            if "scheduled_emails" in table_names:
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_scheduled_emails_job_id ON scheduled_emails(job_id)"))
            print("MIGRATION SUCCESS: Configured database indexes.")
    except Exception as e:
        print(f"MIGRATION ERROR: Failed to run database initialization or migrations: {e}")

# Run migrations at startup unless explicitly skipped
if os.getenv("SKIP_MIGRATIONS") != "1":
    run_migrations()

app = FastAPI(title="Smart Resume Screener")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

# Authentication Dependency (SSO)
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> models.User:
    token_str = None
    if credentials:
        token_str = credentials.credentials
    elif token:
        token_str = token
        
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated",
        )
        
    try:
        payload = jwt.decode(token_str, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
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
    email_cleaned = request_data.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email_cleaned).first()
    
    # To prevent email harvesting, always return success even if user doesn't exist.
    # Print the resolution reason in backend logs for easy developer debugging.
    debug_status = "unknown"
    if not user:
        debug_status = "user_not_found"
        print(f"FORGOT PASSWORD: No user found with email '{email_cleaned}' in database.")
    elif user.auth_provider != "local":
        debug_status = f"google_sso_provider_{user.auth_provider}"
        print(f"FORGOT PASSWORD: User '{email_cleaned}' exists but is registered via Google SSO (auth_provider='{user.auth_provider}'). Reset skipped.")
    else:
        print(f"FORGOT PASSWORD: Initiating reset email to local user '{email_cleaned}'.")
        try:
            reset_token = auth.create_password_reset_token(user.email, user.hashed_password)
            delivery_mode = auth.send_reset_email(user.email, reset_token)
            if delivery_mode:
                debug_status = f"email_sent_success_{delivery_mode}"
            else:
                debug_status = "email_sent_success"
        except Exception as e:
            debug_status = f"email_send_failed: {str(e)}"
            print(f"FORGOT PASSWORD ERROR: Failed to send email to local user: {e}")
    
    return {
        "message": "If the email is registered, a password reset link has been sent.",
        "debug_status": debug_status
    }


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
async def create_job(
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
        priority_skills=job_data.priority_skills,
        status=job_data.status or "open"
    )
    # Generate description embedding
    text_to_embed = f"{db_job.title}\n{db_job.priority_skills or ''}\n{db_job.description}"
    try:
        db_job.description_embedding = await get_embedding(text_to_embed)
    except Exception as e:
        print(f"Error generating job embedding: {e}")
        
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    
    # Newly created job has 0 applicants
    setattr(db_job, "applicant_count", 0)
    return db_job


@app.put("/jobs/{job_id}", response_model=schemas.JobResponse)
async def update_job(
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
    job.status = job_data.status or "open"
    
    # Generate/Update description embedding
    text_to_embed = f"{job.title}\n{job.priority_skills or ''}\n{job.description}"
    try:
        job.description_embedding = await get_embedding(text_to_embed)
    except Exception as e:
        print(f"Error updating job embedding: {e}")
    
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
def attach_best_alternative_matches(applicants: list[models.Applicant], db: Session, user_id: int, job_id: int):
    """
    Computes and attaches best alternative match properties as dynamic runtime attributes.
    Only computes alternate matches for applicants whose primary match score is strictly below 65%.
    """
    other_jobs = db.query(models.Job).filter(
        models.Job.user_id == user_id,
        models.Job.id != job_id
    ).all()

    # Pre-fetch candidate screened status map to avoid query loops
    screened_lookup = {}
    applicant_emails = [a.email.strip().lower() for a in applicants if a.email and a.email.strip().lower() != "unknown@example.com"]
    if applicant_emails:
        screened_records = db.query(models.Applicant.email, models.Applicant.job_id, models.Applicant.id).filter(
            func.lower(models.Applicant.email).in_(applicant_emails)
        ).all()
        for email_addr, o_job_id, app_id in screened_records:
            e_lower = email_addr.strip().lower()
            if e_lower not in screened_lookup:
                screened_lookup[e_lower] = {}
            screened_lookup[e_lower][o_job_id] = app_id

    for app in applicants:
        best_title = None
        best_o_id = None
        best_score = None
        best_is_screened = None
        best_app_id = None

        if app.resume_embedding and (app.match_score or 0) < 65:
            highest_sim = -1.0
            for o_job in other_jobs:
                if o_job.description_embedding:
                    sim = cosine_similarity(app.resume_embedding, o_job.description_embedding)
                    if sim > highest_sim:
                        highest_sim = sim
                        best_title = o_job.title
                        best_o_id = o_job.id
            
            # Use 65% matching similarity as threshold to suggest alternative position
            if highest_sim >= 0.65:
                best_score = max(0.0, round(highest_sim * 100, 1))
                email_lower = app.email.strip().lower() if app.email else ""
                best_is_screened = email_lower in screened_lookup and best_o_id in screened_lookup[email_lower]
                best_app_id = screened_lookup[email_lower][best_o_id] if best_is_screened else None

        setattr(app, "best_alternative_job_title", best_title)
        setattr(app, "best_alternative_job_id", best_o_id)
        setattr(app, "best_alternative_score", best_score)
        setattr(app, "best_alternative_is_screened", best_is_screened)
        setattr(app, "best_alternative_applicant_id", best_app_id)


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

    attach_best_alternative_matches(applicants, db, current_user.id, job_id)
    
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
        # Extract text from file in a thread pool to prevent blocking the event loop
        file_bytes = await resume_file.read()
        resume_text = await anyio.to_thread.run_sync(extract_text, resume_file.filename, file_bytes)
        
        # Trigger Gemini AI matching and embedding generation concurrently
        screening_task = screen_resume(job.description, resume_text, job.priority_skills or "")
        embedding_task = get_embedding(resume_text)
        
        results = await asyncio.gather(screening_task, embedding_task, return_exceptions=True)
        
        # Handle the screening result
        if isinstance(results[0], Exception):
            raise results[0]
        screening_res = results[0]
        
        # Handle the embedding result
        if isinstance(results[1], Exception):
            print(f"Error generating resume embedding: {results[1]}")
            resume_emb = None
        else:
            resume_emb = results[1]
            
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
            existing_applicant.resume_pdf_bytes = file_bytes
            existing_applicant.match_score = screening_res["match_score"]
            existing_applicant.summary = screening_res["summary"]
            existing_applicant.strengths = screening_res["strengths"]
            existing_applicant.improvements = screening_res["improvements"]
            existing_applicant.skills_matched = screening_res["skills_matched"]
            existing_applicant.skills_missing = screening_res["skills_missing"]
            existing_applicant.resume_embedding = resume_emb
            existing_applicant.created_at = func.now() # update timestamp to show latest screening date
            
            db.commit()
            db.refresh(existing_applicant)
            attach_best_alternative_matches([existing_applicant], db, current_user.id, job_id)
            return existing_applicant
        else:
            # Save results to SQL database
            applicant = models.Applicant(
                job_id=job_id,
                email=candidate_email,
                name=screening_res.get("candidate_name", "Unknown Candidate"),
                resume_filename=resume_file.filename,
                resume_text=resume_text,
                resume_pdf_bytes=file_bytes,
                match_score=screening_res["match_score"],
                summary=screening_res["summary"],
                strengths=screening_res["strengths"],
                improvements=screening_res["improvements"],
                skills_matched=screening_res["skills_matched"],
                skills_missing=screening_res["skills_missing"],
                resume_embedding=resume_emb
            )
            db.add(applicant)
            db.commit()
            db.refresh(applicant)
            attach_best_alternative_matches([applicant], db, current_user.id, job_id)
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
        # Extract text from file in a thread pool to prevent blocking the event loop
        file_bytes = await resume_file.read()
        resume_text = await anyio.to_thread.run_sync(extract_text, resume_file.filename, file_bytes)
        
        # Trigger Gemini AI matching and embedding generation concurrently
        screening_task = screen_resume(job.description, resume_text, job.priority_skills or "")
        embedding_task = get_embedding(resume_text)
        
        results = await asyncio.gather(screening_task, embedding_task, return_exceptions=True)
        
        # Handle the screening result
        if isinstance(results[0], Exception):
            raise results[0]
        screening_res = results[0]
        
        # Handle the embedding result
        if isinstance(results[1], Exception):
            print(f"Error generating resume embedding during rescreen: {results[1]}")
            resume_emb = None
        else:
            resume_emb = results[1]
            
        # Update existing candidate record
        applicant.name = screening_res.get("candidate_name", "Unknown Candidate")
        applicant.resume_filename = resume_file.filename
        applicant.resume_text = resume_text
        applicant.resume_pdf_bytes = file_bytes
        applicant.match_score = screening_res["match_score"]
        applicant.summary = screening_res["summary"]
        applicant.strengths = screening_res["strengths"]
        applicant.improvements = screening_res["improvements"]
        applicant.skills_matched = screening_res["skills_matched"]
        applicant.skills_missing = screening_res["skills_missing"]
        applicant.resume_embedding = resume_emb
        
        db.commit()
        db.refresh(applicant)
        attach_best_alternative_matches([applicant], db, current_user.id, job_id)
        
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
    attach_best_alternative_matches([applicant], db, current_user.id, job_id)
    return applicant


@app.delete("/jobs/{job_id}/applicants/{applicant_id}")
def delete_applicant(
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
            detail="Not authorized to delete candidates from this job."
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
        
    db.delete(applicant)
    db.commit()
    return {"message": "Candidate deleted successfully."}


@app.get("/jobs/{job_id}/applicants/{applicant_id}/resume")
def get_applicant_resume_file(
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
            detail="Not authorized to access this candidate."
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
        
    if not applicant.resume_pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume document was not saved as binary payload."
        )
        
    media_type = "application/pdf" if applicant.resume_filename.lower().endswith(".pdf") else "text/plain"
    
    return Response(
        content=applicant.resume_pdf_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename=\"{applicant.resume_filename}\""}
    )


@app.post("/jobs/{job_id}/applicants/send-email")
def send_bulk_emails(
    job_id: int,
    req: schemas.BulkEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Verify Job ownership
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this job."
        )

    # 2. Check if send_at is set for scheduling
    if req.send_at and req.send_at.strip():
        import datetime
        try:
            # Parse ISO UTC string
            send_at_str = req.send_at.strip()
            if send_at_str.endswith("Z"):
                send_at_str = send_at_str[:-1] + "+00:00"
            send_at_dt = datetime.datetime.fromisoformat(send_at_str).astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date-time format for send_at: {e}"
            )

        # Validate that send_at is in the future (at least 30 seconds from now)
        now_utc = datetime.datetime.utcnow()
        if send_at_dt <= now_utc + datetime.timedelta(seconds=30):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled time must be at least 30 seconds in the future."
            )

        # Store in scheduled_emails table
        scheduled_email = models.ScheduledEmail(
            job_id=job_id,
            applicant_ids=req.applicant_ids,
            subject_template=req.subject_template,
            body_template=req.body_template,
            send_at=send_at_dt,
            status="pending"
        )
        db.add(scheduled_email)
        db.commit()
        db.refresh(scheduled_email)

        return {
            "status": "scheduled",
            "message": f"Successfully scheduled {len(req.applicant_ids)} emails to be sent at {req.send_at} UTC."
        }

    # 3. Retrieve applicants matching job_id and requested ids (immediate sending logic)
    applicants = db.query(models.Applicant).filter(
        models.Applicant.job_id == job_id,
        models.Applicant.id.in_(req.applicant_ids)
    ).all()

    # Map database results by id for quick lookup
    applicant_map = {a.id: a for a in applicants}

    results = []
    sent_count = 0
    failed_count = 0

    for app_id in req.applicant_ids:
        app = applicant_map.get(app_id)
        if not app:
            results.append({"applicant_id": app_id, "status": "failed", "error": "Candidate not found under this job."})
            failed_count += 1
            continue

        try:
            # Render templates
            name = app.name or "Candidate"
            job_title = job.title or "Position"
            score_str = f"{app.match_score}%" if app.match_score is not None else "N/A"
            email_address = app.email

            rendered_subject = req.subject_template.replace("{name}", name)\
                                                    .replace("{job_title}", job_title)\
                                                    .replace("{score}", score_str)\
                                                    .replace("{email}", email_address)

            rendered_body = req.body_template.replace("{name}", name)\
                                              .replace("{job_title}", job_title)\
                                              .replace("{score}", score_str)\
                                              .replace("{email}", email_address)

            # Send email
            auth.send_email(to_email=email_address, subject=rendered_subject, body_text=rendered_body)
            results.append({"applicant_id": app_id, "email": email_address, "status": "success"})
            sent_count += 1
        except Exception as e:
            results.append({"applicant_id": app_id, "email": app.email, "status": "failed", "error": str(e)})
            failed_count += 1

    # Log the immediate email outreach in the scheduled_emails database table
    import datetime
    scheduled_email = models.ScheduledEmail(
        job_id=job_id,
        applicant_ids=req.applicant_ids,
        subject_template=req.subject_template,
        body_template=req.body_template,
        send_at=datetime.datetime.utcnow(),
        status="sent" if failed_count == 0 else ("failed" if sent_count == 0 else "partial_failed"),
        results=results,
        error_message=f"{failed_count} emails failed to send." if failed_count > 0 else None
    )
    db.add(scheduled_email)
    db.commit()

    return {
        "status": "sent",
        "sent_count": sent_count,
        "failed_count": failed_count,
        "results": results
    }


@app.post("/jobs/cron/send-scheduled-emails")
def send_scheduled_emails_cron(db: Session = Depends(get_db)):
    import datetime
    now_utc = datetime.datetime.utcnow()

    # Find pending scheduled emails that are due
    due_emails = db.query(models.ScheduledEmail).filter(
        models.ScheduledEmail.status == "pending",
        models.ScheduledEmail.send_at <= now_utc
    ).all()

    processed_count = 0
    sent_count = 0
    failed_count = 0
    details = []

    for email_job in due_emails:
        # Retrieve job
        job = db.query(models.Job).filter(models.Job.id == email_job.job_id).first()
        if not job:
            email_job.status = "failed"
            email_job.error_message = "Linked job position not found."
            db.commit()
            details.append({"job_id": email_job.id, "status": "failed", "error": "Job not found"})
            failed_count += 1
            continue

        # Retrieve applicants
        applicants = db.query(models.Applicant).filter(
            models.Applicant.job_id == email_job.job_id,
            models.Applicant.id.in_(email_job.applicant_ids)
        ).all()
        applicant_map = {a.id: a for a in applicants}

        job_sent_success = True
        job_errors = []
        job_results = []
        cron_sent_count = 0
        cron_failed_count = 0

        for app_id in email_job.applicant_ids:
            app = applicant_map.get(app_id)
            if not app:
                error_str = f"Candidate {app_id} not found under job."
                job_errors.append(error_str)
                job_results.append({"applicant_id": app_id, "status": "failed", "error": error_str})
                cron_failed_count += 1
                continue

            try:
                name = app.name or "Candidate"
                job_title = job.title or "Position"
                score_str = f"{app.match_score}%" if app.match_score is not None else "N/A"
                email_address = app.email

                rendered_subject = email_job.subject_template.replace("{name}", name)\
                                                            .replace("{job_title}", job_title)\
                                                            .replace("{score}", score_str)\
                                                            .replace("{email}", email_address)

                rendered_body = email_job.body_template.replace("{name}", name)\
                                                      .replace("{job_title}", job_title)\
                                                      .replace("{score}", score_str)\
                                                      .replace("{email}", email_address)

                auth.send_email(to_email=email_address, subject=rendered_subject, body_text=rendered_body)
                job_results.append({"applicant_id": app_id, "email": email_address, "status": "success"})
                cron_sent_count += 1
                sent_count += 1
            except Exception as e:
                job_sent_success = False
                job_errors.append(f"Candidate {app_id}: {e}")
                job_results.append({"applicant_id": app_id, "email": app.email, "status": "failed", "error": str(e)})
                cron_failed_count += 1
                failed_count += 1

        email_job.results = job_results
        if cron_failed_count == 0:
            email_job.status = "sent"
            email_job.error_message = None
        elif cron_sent_count == 0:
            email_job.status = "failed"
            email_job.error_message = "; ".join(job_errors)
        else:
            email_job.status = "partial_failed"
            email_job.error_message = f"{cron_failed_count} emails failed to send: " + "; ".join(job_errors)

        db.commit()
        processed_count += 1
        details.append({
            "scheduled_email_id": email_job.id,
            "status": email_job.status,
            "error": email_job.error_message
        })

    return {
        "processed_jobs": processed_count,
        "sent_emails_count": sent_count,
        "failed_emails_count": failed_count,
        "details": details
    }


import asyncio
import sys

async def poll_scheduled_emails_periodic():
    # Wait 5 seconds after startup before first run
    await asyncio.sleep(5)
    while True:
        try:
            from database import SessionLocal
            db = SessionLocal()
            try:
                res = send_scheduled_emails_cron(db)
                if res and res.get("processed_jobs", 0) > 0:
                    print(f"BACKGROUND POLLER: Processed {res['processed_jobs']} scheduled email jobs. Sent: {res['sent_emails_count']}, Failed: {res['failed_emails_count']}")
            finally:
                db.close()
        except Exception as e:
            print(f"Background scheduled email poller error: {e}")
        # Poll every 15 seconds to ensure fast delivery
        await asyncio.sleep(15)

if "pytest" not in sys.modules:
    @app.on_event("startup")
    async def startup_event():
        asyncio.create_task(poll_scheduled_emails_periodic())



@app.get("/jobs/{job_id}/emails", response_model=list[schemas.ScheduledEmailResponse])
def get_job_emails(
    job_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job exists and belongs to user
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job position not found."
        )
    if job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view emails for this job."
        )

    emails = db.query(models.ScheduledEmail).filter(
        models.ScheduledEmail.job_id == job_id
    ).order_by(models.ScheduledEmail.created_at.desc()).all()

    return emails


@app.delete("/jobs/{job_id}/emails/{email_job_id}")
def delete_scheduled_email(
    job_id: int,
    email_job_id: int,
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
            detail="Not authorized to modify emails for this job."
        )

    email_job = db.query(models.ScheduledEmail).filter(
        models.ScheduledEmail.id == email_job_id,
        models.ScheduledEmail.job_id == job_id
    ).first()
    if not email_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email record not found."
        )

    # Only pending emails can be cancelled
    if email_job.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending scheduled emails can be cancelled."
        )

    db.delete(email_job)
    db.commit()
    return {"message": "Scheduled email cancelled successfully."}


@app.get("/jobs/{job_id}/applicants/{applicant_id}/alternative-matches")
async def get_alternative_matches(
    job_id: int,
    applicant_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify applicant exists and job belongs to current user
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job position not found.")
    if job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this job.")
        
    applicant = db.query(models.Applicant).filter(
        models.Applicant.id == applicant_id,
        models.Applicant.job_id == job_id
    ).first()
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found.")

    # 1. Backfill candidate's resume embedding if missing
    if not applicant.resume_embedding:
        try:
            applicant.resume_embedding = await get_embedding(applicant.resume_text)
            db.commit()
        except Exception as e:
            print(f"Error backfilling applicant embedding: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate resume embedding: {e}")

    # 2. Get all other active jobs for this user
    other_jobs = db.query(models.Job).filter(
        models.Job.user_id == current_user.id,
        models.Job.id != job_id
    ).all()

    matches = []
    for o_job in other_jobs:
        # Backfill job's description embedding if missing
        if not o_job.description_embedding:
            try:
                text_to_embed = f"{o_job.title}\n{o_job.priority_skills or ''}\n{o_job.description}"
                o_job.description_embedding = await get_embedding(text_to_embed)
                db.commit()
            except Exception as e:
                print(f"Error backfilling job embedding: {e}")
                continue

        # Compute cosine similarity
        sim = cosine_similarity(applicant.resume_embedding, o_job.description_embedding)
        similarity_pct = max(0.0, round(sim * 100, 1))

        # Check if candidate is already screened for this other job
        existing_other = None
        if applicant.email and applicant.email.strip().lower() != "unknown@example.com":
            existing_other = db.query(models.Applicant).filter(
                models.Applicant.job_id == o_job.id,
                func.lower(models.Applicant.email) == applicant.email.strip().lower()
            ).first()

        matches.append({
            "job_id": o_job.id,
            "title": o_job.title,
            "department": o_job.department,
            "similarity": similarity_pct,
            "is_screened": existing_other is not None,
            "screened_score": existing_other.match_score if existing_other else None,
            "screened_applicant_id": existing_other.id if existing_other else None
        })

    # Sort matches by similarity percentage descending
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches


@app.post("/jobs/{job_id}/applicants/{applicant_id}/transfer-screen/{target_job_id}", response_model=schemas.ApplicantResponse)
async def transfer_screen_candidate(
    job_id: int,
    applicant_id: int,
    target_job_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify applicant and source job ownership
    source_job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not source_job or source_job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access source job.")

    applicant = db.query(models.Applicant).filter(
        models.Applicant.id == applicant_id,
        models.Applicant.job_id == job_id
    ).first()
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found.")

    # Verify target job ownership
    target_job = db.query(models.Job).filter(models.Job.id == target_job_id).first()
    if not target_job or target_job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access target job.")

    # Check if they are already screened under the target job
    existing_target = None
    if applicant.email and applicant.email.strip().lower() != "unknown@example.com":
        existing_target = db.query(models.Applicant).filter(
            models.Applicant.job_id == target_job_id,
            func.lower(models.Applicant.email) == applicant.email.strip().lower()
        ).first()

    # Trigger screening against the target job's description
    try:
        screening_res = await screen_resume(target_job.description, applicant.resume_text, target_job.priority_skills or "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed screening candidate against target job: {e}")

    # Use the same resume embedding or generate if missing
    resume_emb = applicant.resume_embedding
    if not resume_emb:
        try:
            resume_emb = await get_embedding(applicant.resume_text)
            applicant.resume_embedding = resume_emb
        except Exception as e:
            print(f"Error generating embedding during transfer: {e}")

    if existing_target:
        # Update existing record under target job
        existing_target.name = screening_res.get("candidate_name", applicant.name or "Unknown Candidate")
        existing_target.resume_filename = applicant.resume_filename
        existing_target.resume_text = applicant.resume_text
        existing_target.resume_pdf_bytes = applicant.resume_pdf_bytes
        existing_target.match_score = screening_res["match_score"]
        existing_target.summary = screening_res["summary"]
        existing_target.strengths = screening_res["strengths"]
        existing_target.improvements = screening_res["improvements"]
        existing_target.skills_matched = screening_res["skills_matched"]
        existing_target.skills_missing = screening_res["skills_missing"]
        existing_target.resume_embedding = resume_emb
        existing_target.created_at = func.now()
        
        db.commit()
        db.refresh(existing_target)
        attach_best_alternative_matches([existing_target], db, current_user.id, target_job_id)
        return existing_target
    else:
        # Create new record under target job
        new_applicant = models.Applicant(
            job_id=target_job_id,
            email=applicant.email,
            name=screening_res.get("candidate_name", applicant.name or "Unknown Candidate"),
            resume_filename=applicant.resume_filename,
            resume_text=applicant.resume_text,
            resume_pdf_bytes=applicant.resume_pdf_bytes,
            match_score=screening_res["match_score"],
            summary=screening_res["summary"],
            strengths=screening_res["strengths"],
            improvements=screening_res["improvements"],
            skills_matched=screening_res["skills_matched"],
            skills_missing=screening_res["skills_missing"],
            resume_embedding=resume_emb
        )
        db.add(new_applicant)
        db.commit()
        db.refresh(new_applicant)
        attach_best_alternative_matches([new_applicant], db, current_user.id, target_job_id)
        return new_applicant


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
