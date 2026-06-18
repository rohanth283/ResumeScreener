import time
from locust import HttpUser, task, between

# Sample resume text for load testing
MOCK_RESUME = """
Name: Locust Load Tester
Email: locust.user@example.com
Experience:
- QA & Load Test Engineer at ScaleOps (2021-Present)
  * Designed automated scripts handling 10,000 requests/sec.
Skills: Python, Load Testing, locust, REST APIs
"""

class RecruiterSimulationUser(HttpUser):
    # Simulates recruiter pausing between 1 and 3 seconds between actions
    wait_time = between(1, 3)
    
    token = None
    job_id = None

    def on_start(self):
        """Executed when a virtual user starts: registers and logs in."""
        self.email = f"locust_recruiter_{int(time.time() * 1000)}@example.com"
        self.password = "Secr3tPassword!"
        
        # 1. Sign up user
        signup_payload = {
            "email": self.email,
            "password": self.password,
            "name": "Locust Recruiter"
        }
        with self.client.post("/auth/signup", json=signup_payload, catch_response=True) as response:
            if response.status_code == 200:
                self.token = response.json().get("access_token")
                response.success()
            else:
                response.failure(f"Signup failed: {response.text}")
                return

        # 2. Create a Job to run applicant screening against
        if self.token:
            headers = {"Authorization": f"Bearer {self.token}"}
            job_payload = {
                "title": "Locust Test Engineer",
                "description": "Must have expertise in Python, load testing, and database optimization.",
                "priority_skills": "Python, locust"
            }
            with self.client.post("/jobs", json=job_payload, headers=headers, catch_response=True) as response:
                if response.status_code == 200:
                    self.job_id = response.json().get("id")
                    response.success()
                else:
                    response.failure(f"Job creation failed: {response.text}")

    @task(3)
    def view_jobs(self):
        """Simulates loading the jobs list dashboard (high frequency)."""
        if not self.token:
            return
        headers = {"Authorization": f"Bearer {self.token}"}
        self.client.get("/jobs", headers=headers)

    @task(2)
    def view_applicants(self):
        """Simulates viewing the applicants list for the created job."""
        if not self.token or not self.job_id:
            return
        headers = {"Authorization": f"Bearer {self.token}"}
        self.client.get(f"/jobs/{self.job_id}/applicants", headers=headers)

    @task(1)
    def screen_resume_task(self):
        """Simulates uploading and screening a candidate resume (lower frequency)."""
        if not self.token or not self.job_id:
            return
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Create file-like payload in memory
        files = {
            "resume_file": ("resume_locust.txt", MOCK_RESUME.encode("utf-8"), "text/plain")
        }
        
        # Pass a randomized candidate email to avoid duplicate update database locks during test run
        form_data = {
            "email": f"locust_candidate_{int(time.time() * 1000)}@example.com"
        }
        
        self.client.post(
            f"/jobs/{self.job_id}/screen",
            files=files,
            data=form_data,
            headers=headers
        )
