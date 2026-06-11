from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_screen_missing_fields():
    # Test missing resume file
    response = client.post(
        "/screen",
        data={"job_description": "Python Developer"}
    )
    assert response.status_code == 422 # FastAPI validation error for missing field

def test_screen_empty_job_description():
    # Test empty job description string
    files = {"resume_file": ("resume.txt", b"My Resume Content", "text/plain")}
    response = client.post(
        "/screen",
        data={"job_description": ""},
        files=files
    )
    assert response.status_code == 400
    assert response.json() == {"error": "Job description is required."}

def test_screen_invalid_file_type():
    files = {"resume_file": ("resume.png", b"fake binary image data", "image/png")}
    response = client.post(
        "/screen",
        data={"job_description": "Python Developer"},
        files=files
    )
    assert response.status_code == 400
    assert response.json() == {"error": "Resume must be a .pdf or .txt file."}
