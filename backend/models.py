from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)  # Nullable for SSO (Google) users
    role = Column(String, default="Viewer", nullable=False)  # Viewer, Recruiter, Admin (ignored in this version)
    auth_provider = Column(String, default="local", nullable=False)  # local, google

    # Relationship to jobs with cascade delete
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True) # nullable=True for backwards-compatibility migration
    title = Column(String, nullable=False)
    department = Column(String, nullable=True)
    location = Column(String, nullable=True)
    employment_type = Column(String, nullable=True)  # Full-time, Part-time, Contract, etc.
    description = Column(String, nullable=False)
    priority_skills = Column(String, nullable=True)  # Comma-separated list of priority skills
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to user
    user = relationship("User", back_populates="jobs")

    # Relationship to applicants with cascade delete
    applicants = relationship("Applicant", back_populates="job", cascade="all, delete-orphan")

class Applicant(Base):
    __tablename__ = "applicants"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    name = Column(String, nullable=True)  # Extracted from resume by AI
    resume_filename = Column(String, nullable=False)
    resume_text = Column(String, nullable=False)
    match_score = Column(Integer, nullable=False)
    summary = Column(JSON, nullable=False)  # Stored as a list of bullet points (strings)
    strengths = Column(JSON, nullable=False)  # List of strings
    improvements = Column(JSON, nullable=False)  # List of strings
    skills_matched = Column(JSON, nullable=False)  # List of strings matching job reqs
    skills_missing = Column(JSON, nullable=False)  # List of strings missing from candidate
    is_reviewed = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="applicants")


class ScheduledEmail(Base):
    __tablename__ = "scheduled_emails"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    applicant_ids = Column(JSON, nullable=False)  # Stored as list of integer applicant IDs
    subject_template = Column(String, nullable=False)
    body_template = Column(String, nullable=False)
    send_at = Column(DateTime, nullable=False)  # In UTC time
    status = Column(String, default="pending", nullable=False)  # pending, sent, failed
    error_message = Column(String, nullable=True)
    results = Column(JSON, nullable=True)  # Stores individual recipient status list
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job")
