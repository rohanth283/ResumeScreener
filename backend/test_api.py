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
        "candidate_email": "john.doe@example.com",
        "match_score": 85 if not priority_skills else 95,
        "summary": ["Mocked bullet point 1.", "Mocked bullet point 2.", "Mocked bullet point 3."],
        "strengths": ["Skill A", "Skill B", "Skill C"],
        "improvements": ["Learn Skill D", "Learn Skill E", "Learn Skill F"],
        "skills_matched": ["FastAPI", "React"],
        "skills_missing": ["Python"]
    }
    yield
    main.screen_resume = original_screen_resume


@pytest.fixture(autouse=True)
def mock_send_email(monkeypatch):
    def mock_send(email, token):
        from auth import _log_email_locally
        frontend_url = "http://localhost:3000"
        reset_link = f"{frontend_url}/?view=reset-password&token={token}"
        body_text = f"Hello,\n\nPlease reset your password by clicking the link below:\n{reset_link}\n\nThis link will expire in 15 minutes."
        _log_email_locally(email, reset_link, body_text)
    
    monkeypatch.setattr(auth, "send_reset_email", mock_send)


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


def test_screen_without_email():
    # 1. Signup recruiter user
    signup_payload = {
        "email": "recruiter2@example.com",
        "password": "securepassword",
        "name": "Jane Recruiter 2"
    }
    response = client.post("/auth/signup", json=signup_payload)
    assert response.status_code == 200
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create a new Job
    job_payload = {
        "title": "Software Engineer 2",
        "department": "Engineering",
        "description": "FastAPI experience required."
    }
    response = client.post("/jobs", json=job_payload, headers=headers)
    job_id = response.json()["id"]

    # 3. Screen a candidate's resume for this job without passing "email" in form
    resume_file = ("resume.txt", b"John Doe's Resume details: FastAPI, SQL, React", "text/plain")
    response = client.post(
        f"/jobs/{job_id}/screen",
        files={"resume_file": resume_file},
        headers=headers
    )
    assert response.status_code == 200
    app_data = response.json()
    assert app_data["email"] == "john.doe@example.com"  # Extracted from mock response
    assert app_data["name"] == "John Doe"


def test_screen_duplicate_applicants():
    # 1. Signup recruiter
    signup_payload = {
        "email": "recruiter_dup@example.com",
        "password": "securepassword",
        "name": "Jane Recruiter Dup"
    }
    response = client.post("/auth/signup", json=signup_payload)
    assert response.status_code == 200
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create job
    job_payload = {
        "title": "Staff Engineer",
        "department": "Engineering",
        "description": "Expert in FastAPI."
    }
    response = client.post("/jobs", json=job_payload, headers=headers)
    job_id = response.json()["id"]

    # 3. Screen first time (with candidate@example.com)
    resume1 = ("resume1.txt", b"FastAPI expert resume", "text/plain")
    response = client.post(
        f"/jobs/{job_id}/screen",
        data={"email": "candidate@example.com"},
        files={"resume_file": resume1},
        headers=headers
    )
    assert response.status_code == 200
    id1 = response.json()["id"]

    # Verify 1 applicant in DB
    response = client.get(f"/jobs/{job_id}/applicants", headers=headers)
    assert len(response.json()) == 1

    # 4. Screen second time (with candidate@example.com) but different file name and email case-insensitivity
    resume2 = ("resume_updated.txt", b"FastAPI expert resume updated", "text/plain")
    response = client.post(
        f"/jobs/{job_id}/screen",
        data={"email": "CANDIDATE@example.com"},
        files={"resume_file": resume2},
        headers=headers
    )
    assert response.status_code == 200
    id2 = response.json()["id"]

    # Verify ID is the same (updated in-place)
    assert id1 == id2
    assert response.json()["resume_filename"] == "resume_updated.txt"

    # Verify still only 1 applicant in DB
    response = client.get(f"/jobs/{job_id}/applicants", headers=headers)
    applicants = response.json()
    assert len(applicants) == 1
    assert applicants[0]["resume_filename"] == "resume_updated.txt"

    # 5. Screen with "unknown@example.com" placeholder email (simulating no email extracted)
    # We will override mock_screen_resume default email to unknown@example.com
    import main
    original_screen = main.screen_resume
    main.screen_resume = lambda jd, text, priority_skills="": {
        "candidate_name": "No Email Candidate",
        "candidate_email": "unknown@example.com",
        "match_score": 50,
        "summary": [], "strengths": [], "improvements": [], "skills_matched": [], "skills_missing": []
    }

    try:
        response = client.post(
            f"/jobs/{job_id}/screen",
            files={"resume_file": ("resume_no_email1.txt", b"No email here", "text/plain")},
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["email"] == "unknown@example.com"

        response2 = client.post(
            f"/jobs/{job_id}/screen",
            files={"resume_file": ("resume_no_email2.txt", b"Another no email", "text/plain")},
            headers=headers
        )
        assert response2.status_code == 200
        assert response2.json()["email"] == "unknown@example.com"

        # Verify they are treated as two distinct applicants since email was "unknown@example.com"
        response = client.get(f"/jobs/{job_id}/applicants", headers=headers)
        assert len(response.json()) == 3 # 1 original + 2 unknown placeholder applicants
    finally:
        main.screen_resume = original_screen


def test_multi_tenant_job_isolation():
    # 1. Signup Recruiter A
    signup_a = {"email": "recruiter_a@example.com", "password": "password123", "name": "Recruiter A"}
    res = client.post("/auth/signup", json=signup_a)
    assert res.status_code == 200
    token_a = res.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 2. Signup Recruiter B
    signup_b = {"email": "recruiter_b@example.com", "password": "password123", "name": "Recruiter B"}
    res = client.post("/auth/signup", json=signup_b)
    assert res.status_code == 200
    token_b = res.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Recruiter A creates a job
    job_payload = {"title": "Recruiter A Job", "description": "FastAPI expert Required"}
    res = client.post("/jobs", json=job_payload, headers=headers_a)
    assert res.status_code == 200
    job_id = res.json()["id"]

    # 4. Verify Recruiter B cannot see this job in their job list
    res = client.get("/jobs", headers=headers_b)
    assert res.status_code == 200
    jobs_b = res.json()
    assert len(jobs_b) == 0

    # 5. Verify Recruiter B cannot update this job (403 Forbidden)
    res = client.put(f"/jobs/{job_id}", json={"title": "Hacked", "description": "Hacked description"}, headers=headers_b)
    assert res.status_code == 403

    # 6. Verify Recruiter B cannot screen a candidate to this job (403 Forbidden)
    resume = ("resume.txt", b"fastapi resume details", "text/plain")
    res = client.post(f"/jobs/{job_id}/screen", files={"resume_file": resume}, headers=headers_b)
    assert res.status_code == 403

    # 7. Verify Recruiter B cannot view applicants of this job (403 Forbidden)
    res = client.get(f"/jobs/{job_id}/applicants", headers=headers_b)
    assert res.status_code == 403

    # 8. Verify Recruiter B cannot delete this job (403 Forbidden)
    res = client.delete(f"/jobs/{job_id}", headers=headers_b)
    assert res.status_code == 403


def test_applicant_review_toggle_and_isolation():
    # 1. Signup Recruiter A and create job
    signup_a = {"email": "recruiter_a@example.com", "password": "password123", "name": "Recruiter A"}
    res = client.post("/auth/signup", json=signup_a)
    assert res.status_code == 200
    token_a = res.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    job_payload = {"title": "React Engineer", "description": "Needs React skill"}
    res = client.post("/jobs", json=job_payload, headers=headers_a)
    assert res.status_code == 200
    job_id = res.json()["id"]

    # 2. Screen candidate under Recruiter A's job
    resume = ("resume.txt", b"react resume details", "text/plain")
    res = client.post(f"/jobs/{job_id}/screen", files={"resume_file": resume}, headers=headers_a)
    assert res.status_code == 200
    applicant = res.json()
    applicant_id = applicant["id"]
    assert applicant["is_reviewed"] is False

    # 3. Signup Recruiter B
    signup_b = {"email": "recruiter_b@example.com", "password": "password123", "name": "Recruiter B"}
    res = client.post("/auth/signup", json=signup_b)
    assert res.status_code == 200
    token_b = res.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 4. Verify Recruiter B cannot toggle review for Recruiter A's candidate (403 Forbidden)
    res = client.put(f"/jobs/{job_id}/applicants/{applicant_id}/review", headers=headers_b)
    assert res.status_code == 403

    # 5. Verify Recruiter A can toggle review successfully (True)
    res = client.put(f"/jobs/{job_id}/applicants/{applicant_id}/review", headers=headers_a)
    assert res.status_code == 200
    assert res.json()["is_reviewed"] is True

    # 6. Verify Recruiter A can toggle review back (False)
    res = client.put(f"/jobs/{job_id}/applicants/{applicant_id}/review", headers=headers_a)
    assert res.status_code == 200
    assert res.json()["is_reviewed"] is False


def test_bulk_candidate_email_outreach_and_isolation():
    # 1. Signup Recruiter A and create job
    signup_a = {"email": "recruiter_a_email_test@example.com", "password": "password123", "name": "Recruiter A"}
    res = client.post("/auth/signup", json=signup_a)
    assert res.status_code == 200
    token_a = res.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    job_payload = {"title": "Python Developer", "description": "Needs Python and FastAPI"}
    res = client.post("/jobs", json=job_payload, headers=headers_a)
    assert res.status_code == 200
    job_id = res.json()["id"]

    # 2. Screen 2 candidates under Recruiter A's job
    resume1 = ("resume1.txt", b"Jane Doe\nEmail: jane@example.com\nPython skills", "text/plain")
    res1 = client.post(f"/jobs/{job_id}/screen", files={"resume_file": resume1}, headers=headers_a)
    assert res1.status_code == 200
    applicant1_id = res1.json()["id"]

    resume2 = ("resume2.txt", b"Bob Smith\nEmail: bob@example.com\nPython and FastAPI skills", "text/plain")
    res2 = client.post(f"/jobs/{job_id}/screen", files={"resume_file": resume2}, headers=headers_a)
    assert res2.status_code == 200
    applicant2_id = res2.json()["id"]

    # 3. Signup Recruiter B
    signup_b = {"email": "recruiter_b_email_test@example.com", "password": "password123", "name": "Recruiter B"}
    res = client.post("/auth/signup", json=signup_b)
    assert res.status_code == 200
    token_b = res.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 4. Verify Recruiter B cannot bulk email Recruiter A's applicants (403 Forbidden)
    email_payload = {
        "applicant_ids": [applicant1_id, applicant2_id],
        "subject_template": "Update regarding {job_title}",
        "body_template": "Hello {name}, your score is {score}."
    }
    res_unauth = client.post(f"/jobs/{job_id}/applicants/send-email", json=email_payload, headers=headers_b)
    assert res_unauth.status_code == 403

    # 5. Verify Recruiter A can bulk email successfully
    res_auth = client.post(f"/jobs/{job_id}/applicants/send-email", json=email_payload, headers=headers_a)
    assert res_auth.status_code == 200
    data = res_auth.json()
    assert data["sent_count"] == 2
    assert data["failed_count"] == 0
    assert len(data["results"]) == 2
    assert data["results"][0]["status"] == "success"
    assert data["results"][1]["status"] == "success"







