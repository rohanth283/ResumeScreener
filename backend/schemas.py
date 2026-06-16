from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# User schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str
    auth_provider: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None


# Job schemas
class JobCreate(BaseModel):
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None  # Full-time, Part-time, Contract, etc.
    description: str
    priority_skills: Optional[str] = None  # Comma-separated list of priority skills

class JobResponse(BaseModel):
    id: int
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    description: str
    priority_skills: Optional[str] = None
    created_at: datetime
    applicant_count: int

    class Config:
        from_attributes = True


# Applicant schemas
class ApplicantResponse(BaseModel):
    id: int
    job_id: int
    email: str
    name: Optional[str] = None
    resume_filename: str
    resume_text: str
    match_score: int
    summary: List[str]  # Stored as list of bullet points
    strengths: List[str]
    improvements: List[str]
    skills_matched: List[str]
    skills_missing: List[str]
    is_reviewed: Optional[bool] = False
    created_at: datetime

    class Config:
        from_attributes = True


# Password reset schemas
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

