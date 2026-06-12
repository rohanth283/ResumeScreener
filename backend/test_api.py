import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app, get_db
from database import Base

import models
import auth
import main  # to mock screen_resume

# Set up clean test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency in FastAPI app
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    # Clean recreate tables for every test case
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield

# Mock the screen_resume function to avoid calling Google Gemini API during tests
@pytest.fixture(autouse=True)
def mock_screen_resume():
    original_screen_resume = main.screen_resume
    main.screen_resume = lambda jd, text, priority_skills="": {
        "candidate_name": "John Doe",
        "match_score": 85 if not priority_skills else 95,
        "summary": ["Mocked bullet point 1.", "Mocked bullet point 2.", "Mocked bullet point 3."],
        "strengths": ["Skill A", "Skill B", "Skill C"],
        "improvements": ["Learn Skill D", "Learn Skill E", "Learn Skill F"],
        "skills_matched": ["FastAPI", "React"],
        "skills_missing": ["Python"]
    }
    yield
    main.screen_resume = original_screen_resume


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unauthenticated_requests_fail():
    # Job creation without auth
    response = client.post("/jobs", json={"title": "Dev", "description": "Need a dev"})
    assert response.status_code == 403


def test_full_recruiter_flow():
    # 1. Signup recruiter user
    signup_payload = {
        "email": "recruiter@example.com",
        "password": "securepassword",
        "name": "Jane Recruiter"
    }
    response = client.post("/auth/signup", json=signup_payload)
    assert response.status_code == 200
    auth_data = response.json()
    token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a new Job
    job_payload = {
        "title": "Software Engineer",
        "department": "Engineering",
        "location": "Remote",
        "employment_type": "Full-time",
        "description": "FastAPI and React experience required."
    }
    response = client.post("/jobs", json=job_payload, headers=headers)
    assert response.status_code == 200
    job_data = response.json()
    assert job_data["title"] == "Software Engineer"
    job_id = job_data["id"]

    # 3. List Jobs (should have applicant_count = 0)
    response = client.get("/jobs", headers=headers)
    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 1
    assert jobs[0]["applicant_count"] == 0

    # 4. Screen a candidate's resume for this job
    screen_payload = {
        "email": "candidate@example.com"
    }
    resume_file = ("resume.txt", b"John Doe's Resume details: FastAPI, SQL, React", "text/plain")
    response = client.post(
        f"/jobs/{job_id}/screen",
        data=screen_payload,
        files={"resume_file": resume_file},
        headers=headers
    )
    assert response.status_code == 200
    app_data = response.json()
    assert app_data["email"] == "candidate@example.com"
    assert app_data["name"] == "John Doe"  # Extracted by AI
    assert app_data["match_score"] == 85
    assert len(app_data["strengths"]) == 3
    assert app_data["summary"] == ["Mocked bullet point 1.", "Mocked bullet point 2.", "Mocked bullet point 3."]
    assert app_data["skills_matched"] == ["FastAPI", "React"]
    assert app_data["skills_missing"] == ["Python"]
    applicant_id = app_data["id"]

    # 5. Edit the Job to update title and add priority_skills
    edit_job_payload = {
        "title": "Senior Software Engineer",
        "department": "Engineering",
        "location": "Remote",
        "employment_type": "Full-time",
        "description": "FastAPI and React experience required.",
        "priority_skills": "Python"
    }
    response = client.put(f"/jobs/{job_id}", json=edit_job_payload, headers=headers)
    assert response.status_code == 200
    updated_job = response.json()
    assert updated_job["title"] == "Senior Software Engineer"
    assert updated_job["priority_skills"] == "Python"

    # 6. Rescreen the candidate with a new resume, verifying priority_skills takes effect (returns match_score = 95)
    new_resume_file = ("new_resume.txt", b"John Doe's updated Resume: FastAPI, SQL, React, Python", "text/plain")
    response = client.put(
        f"/jobs/{job_id}/applicants/{applicant_id}/rescreen",
        files={"resume_file": new_resume_file},
        headers=headers
    )
    assert response.status_code == 200
    rescreen_data = response.json()
    assert rescreen_data["id"] == applicant_id
    assert rescreen_data["resume_filename"] == "new_resume.txt"
    assert rescreen_data["match_score"] == 95  # Match score changed because priority_skills was passed
    assert rescreen_data["summary"] == ["Mocked bullet point 1.", "Mocked bullet point 2.", "Mocked bullet point 3."]

    # 7. List Applicants for this job (should have 1 applicant)
    response = client.get(f"/jobs/{job_id}/applicants", headers=headers)
    assert response.status_code == 200
    applicants = response.json()
    assert len(applicants) == 1
    assert applicants[0]["name"] == "John Doe"

    # 8. Verify job's applicant count updated in the list
    response = client.get("/jobs", headers=headers)
    assert response.status_code == 200
    jobs = response.json()
    assert jobs[0]["applicant_count"] == 1

    # 9. Delete the job and verify cascade deletion of applicants
    response = client.delete(f"/jobs/{job_id}", headers=headers)
    assert response.status_code == 200
    
    # Verify job is gone
    response = client.get("/jobs", headers=headers)
    assert len(response.json()) == 0

    # Verify applicants for that job are cascade deleted
    # Attempting to fetch applicants for a deleted job returns 404
    response = client.get(f"/jobs/{job_id}/applicants", headers=headers)
    assert response.status_code == 404


def test_password_reset_flow():
    # Clean up sent_emails.log if it exists
    log_file_path = os.path.join(os.path.dirname(__file__), "sent_emails.log")
    if os.path.exists(log_file_path):
        os.remove(log_file_path)

    # 1. Signup user
    signup_payload = {
        "email": "reset_test@example.com",
        "password": "oldpassword",
        "name": "Reset Test User"
    }
    response = client.post("/auth/signup", json=signup_payload)
    assert response.status_code == 200

    # 2. Request forgot-password link
    response = client.post("/auth/forgot-password", json={"email": "reset_test@example.com"})
    assert response.status_code == 200
    assert response.json() == {"message": "If the email is registered, a password reset link has been sent."}

    # 3. Verify entry in sent_emails.log
    assert os.path.exists(log_file_path)
    with open(log_file_path, "r", encoding="utf-8") as f:
        log_content = f.read()
    assert "reset_test@example.com" in log_content

    # Extract the token from the logged reset link
    import re
    token_match = re.search(r"token=([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+)", log_content)
    assert token_match is not None
    reset_token = token_match.group(1)

    # 4. Attempt to reset password with the token
    reset_payload = {
        "token": reset_token,
        "new_password": "newpassword123"
    }
    response = client.post("/auth/reset-password", json=reset_payload)
    assert response.status_code == 200
    assert response.json() == {"message": "Password reset successfully."}

    # 5. Try to login with old password (should fail 401)
    response = client.post("/auth/login", json={"email": "reset_test@example.com", "password": "oldpassword"})
    assert response.status_code == 401

    # 6. Login with new password (should succeed 200)
    response = client.post("/auth/login", json={"email": "reset_test@example.com", "password": "newpassword123"})
    assert response.status_code == 200
    login_data = response.json()
    assert "access_token" in login_data

    # 7. Attempt to reuse the same reset token (should fail 400 because password changed and hash suffix doesn't match)
    response = client.post("/auth/reset-password", json=reset_payload)
    assert response.status_code == 400
    assert "already been used" in response.json()["detail"]


