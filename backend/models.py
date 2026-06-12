from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, JSON
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

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    department = Column(String, nullable=True)
    location = Column(String, nullable=True)
    employment_type = Column(String, nullable=True)  # Full-time, Part-time, Contract, etc.
    description = Column(String, nullable=False)
    priority_skills = Column(String, nullable=True)  # Comma-separated list of priority skills
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship to applicants with cascade delete
    applicants = relationship("Applicant", back_populates="job", cascade="all, delete-orphan")

class Applicant(Base):
    __tablename__ = "applicants"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    email = Column(String, nullable=False)
    name = Column(String, nullable=True)  # Extracted from resume by AI
    resume_filename = Column(String, nullable=False)
    resume_text = Column(String, nullable=False)
    match_score = Column(Integer, nullable=False)
    summary = Column(JSON, nullable=False)  # Stored as a list of bullet points (strings)
    strengths = Column(JSON, nullable=False)  # List of strings
    improvements = Column(JSON, nullable=False)  # List of strings
    skills_matched = Column(JSON, nullable=False)  # List of strings matching job reqs
    skills_missing = Column(JSON, nullable=False)  # List of strings missing from candidate
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="applicants")
