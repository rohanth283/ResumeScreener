import sys
import os
import requests

API_URL = "http://localhost:8000"
TEST_USER = {
    "email": "integration_tester_123@example.com",
    "password": "integration_password",
    "name": "Integration Tester"
}

def run_test():
    print("Step 1: Signing up / logging in tester...")
    token = None
    try:
        res = requests.post(f"{API_URL}/auth/signup", json=TEST_USER)
        if res.status_code == 200:
            token = res.json()["access_token"]
            print("Successfully signed up new tester user.")
        elif res.status_code == 400:
            # Already registered, log in
            res = requests.post(f"{API_URL}/auth/login", json={
                "email": TEST_USER["email"],
                "password": TEST_USER["password"]
            })
            if res.status_code == 200:
                token = res.json()["access_token"]
                print("Successfully logged in existing tester user.")
            else:
                print(f"Login failed: {res.status_code} - {res.text}")
                sys.exit(1)
        else:
            print(f"Signup failed: {res.status_code} - {res.text}")
            sys.exit(1)
    except Exception as e:
        print(f"Failed to connect to backend: {e}")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}

    print("\nStep 2: Creating a test job...")
    job_payload = {
        "title": "Full Stack Developer (Integration Test)",
        "department": "Engineering",
        "location": "Remote",
        "employment_type": "Full-time",
        "description": "We are looking for a Software Engineer with experience in FastAPI, React, and Python."
    }
    res = requests.post(f"{API_URL}/jobs", json=job_payload, headers=headers)
    if res.status_code != 200:
        print(f"Failed to create job: {res.status_code} - {res.text}")
        sys.exit(1)
    
    job_data = res.json()
    job_id = job_data["id"]
    print(f"Created Job ID: {job_id}")

    print("\nStep 3: Screening resumes (Bulk Upload simulation)...")
    resumes_dir = "../test_resumes"
    files_to_test = [
        "alice_resume.txt",
        "bob_resume.txt",
        "charlie_resume.txt"
    ]

    for filename in files_to_test:
        filepath = os.path.join(resumes_dir, filename)
        if not os.path.exists(filepath):
            print(f"File not found: {filepath}")
            continue

        print(f"\n---> Uploading and screening {filename}...")
        with open(filepath, "rb") as f:
            files = {"resume_file": (filename, f, "text/plain")}
            # Note: we are NOT passing any 'email' field in form data, to test the fallback extraction.
            res = requests.post(f"{API_URL}/jobs/{job_id}/screen", files=files, headers=headers)
        
        if res.status_code == 200:
            data = res.json()
            print("Successfully screened candidate!")
            print(f"  Name:  {data.get('name')}")
            print(f"  Email: {data.get('email')}")
            print(f"  Score: {data.get('match_score')}%")
            print(f"  Summary: {data.get('summary')}")
        else:
            print(f"  Failed to screen candidate: {res.status_code} - {res.text}")

    print("\nStep 4: Fetching job applicants...")
    res = requests.get(f"{API_URL}/jobs/{job_id}/applicants", headers=headers)
    if res.status_code == 200:
        applicants = res.json()
        print(f"Found {len(applicants)} applicants in database:")
        for idx, app in enumerate(applicants):
            print(f"  {idx + 1}. Name: {app.get('name')}, Email: {app.get('email')}, Score: {app.get('match_score')}%")
    else:
        print(f"Failed to fetch applicants: {res.status_code} - {res.text}")

if __name__ == "__main__":
    run_test()
