import asyncio
import time
import os
import sys
import statistics
import httpx

# Settings
BASE_URL = "http://127.0.0.1:8000"
CONCURRENCY = 5  # Number of concurrent resume uploads
NUM_REQUESTS = 5  # Total resumes to upload

# Sample resume content (we use text for clean test uploads)
MOCK_RESUME_TEXT = """
Name: Jane Doe
Email: jane.doe.loadtest@example.com
Phone: (555) 019-2834
Professional Summary:
Senior Full Stack Engineer with 8 years of experience building scalable web applications.
Specialized in Python, FastAPI, and React. Excellent record of metrics-driven results.

Experience:
- Senior Engineer at TechCorp (2020-Present)
  * Redesigned core checkout funnel, increasing conversion rates by 22% and page speed by 40%.
  * Mentored 5 junior engineers and led continuous learning workshops.
- Software Engineer at WebSystems (2018-2020)
  * Migrated monolithic system to FastAPI microservices, reducing query response times by 35%.

Skills: Python, FastAPI, React, JavaScript, AWS, SQL, Docker
Education: B.S. in Computer Science, University of Technology (2018)
"""

async def run_load_test():
    print("=" * 60)
    print("SMART RESUME SCREENER - PERFORMANCE & LOAD TEST HARNESS")
    print("=" * 60)
    print(f"Target URL: {BASE_URL}")
    print(f"Concurrency: {CONCURRENCY} parallel requests")
    print(f"Total uploads: {NUM_REQUESTS}")
    print("-" * 60)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Sign up a unique test recruiter
        test_email = f"loadtest_{int(time.time())}@example.com"
        print(f"[1/3] Creating test recruiter user: {test_email}...")
        signup_payload = {
            "email": test_email,
            "password": "Password123!",
            "name": "Load Tester"
        }
        
        try:
            response = await client.post(f"{BASE_URL}/auth/signup", json=signup_payload)
            if response.status_code != 200:
                print(f"Signup failed: {response.text}")
                return
            token_data = response.json()
            token = token_data["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            print("Signup successful! JWT Token acquired.")
        except Exception as e:
            print(f"Failed to connect to backend at {BASE_URL}: {e}")
            print("Please ensure the FastAPI backend is running locally (e.g. at port 8000).")
            return

        # Step 2: Create a job position
        print(f"[2/3] Creating mock job position...")
        job_payload = {
            "title": "Senior Python/FastAPI Engineer",
            "department": "Engineering",
            "location": "Remote",
            "employment_type": "Full-time",
            "description": "Looking for a Python developer who is excellent at FastAPI, React, and SQL database optimization.",
            "priority_skills": "Python, FastAPI, React"
        }
        response = await client.post(f"{BASE_URL}/jobs", json=job_payload, headers=headers)
        if response.status_code != 200:
            print(f"Failed to create job: {response.text}")
            return
        job = response.json()
        job_id = job["id"]
        print(f"Job created successfully! Job ID: {job_id}")

        # Step 3: Dispatch parallel screening requests
        print(f"[3/3] Commencing load test of {NUM_REQUESTS} parallel uploads...")
        print("-" * 60)
        
        latencies = []
        success_count = 0
        failure_count = 0
        
        async def upload_single_resume(index):
            file_name = f"resume_{index}.txt"
            files = {
                "resume_file": (file_name, MOCK_RESUME_TEXT.encode("utf-8"), "text/plain")
            }
            # Pass custom emails to form data to avoid duplicate overrides in database
            form_data = {
                "email": f"candidate_{index}_{int(time.time())}@example.com"
            }
            
            start_time = time.perf_counter()
            try:
                response = await client.post(
                    f"{BASE_URL}/jobs/{job_id}/screen",
                    files=files,
                    data=form_data,
                    headers=headers
                )
                end_time = time.perf_counter()
                duration = end_time - start_time
                
                if response.status_code == 200:
                    res_json = response.json()
                    print(f"  ✓ [{index+1}/{NUM_REQUESTS}] File {file_name} screened in {duration:.2f}s | Match Score: {res_json['match_score']}%")
                    return duration, True
                else:
                    print(f"  ✗ [{index+1}/{NUM_REQUESTS}] File {file_name} failed with status {response.status_code}: {response.text}")
                    return duration, False
            except Exception as e:
                end_time = time.perf_counter()
                duration = end_time - start_time
                print(f"  ✗ [{index+1}/{NUM_REQUESTS}] File {file_name} raised exception after {duration:.2f}s: {e}")
                return duration, False

        # Run tasks concurrently
        overall_start = time.perf_counter()
        tasks = [upload_single_resume(i) for i in range(NUM_REQUESTS)]
        results = await asyncio.gather(*tasks)
        overall_end = time.perf_counter()
        
        total_test_time = overall_end - overall_start
        
        for duration, is_success in results:
            latencies.append(duration)
            if is_success:
                success_count += 1
            else:
                failure_count += 1
                
        # Step 4: Display Statistics
        print("-" * 60)
        print("PERFORMANCE STATISTICS")
        print("-" * 60)
        print(f"Total Elapsed Test Time: {total_test_time:.2f} seconds")
        print(f"Successful Requests: {success_count}/{NUM_REQUESTS} ({success_count/NUM_REQUESTS*100:.1f}%)")
        print(f"Failed Requests: {failure_count}/{NUM_REQUESTS}")
        
        if latencies:
            avg_lat = statistics.mean(latencies)
            med_lat = statistics.median(latencies)
            min_lat = min(latencies)
            max_lat = max(latencies)
            throughput = success_count / total_test_time
            
            # Percentiles
            sorted_lats = sorted(latencies)
            p90 = sorted_lats[int(len(sorted_lats) * 0.90)]
            p95 = sorted_lats[int(len(sorted_lats) * 0.95)] if len(sorted_lats) > 1 else sorted_lats[0]
            
            print(f"Concurrency Level: {CONCURRENCY}")
            print(f"Throughput: {throughput:.2f} resumes/second")
            print(f"Latency Breakdown:")
            print(f"  - Minimum:   {min_lat:.2f}s")
            print(f"  - Average:   {avg_lat:.2f}s")
            print(f"  - Median:    {med_lat:.2f}s")
            print(f"  - 90th percentile (P90): {p90:.2f}s")
            print(f"  - 95th percentile (P95): {p95:.2f}s")
            print(f"  - Maximum:   {max_lat:.2f}s")
            print("-" * 60)
            
            # Analysis of concurrency speedup
            theoretical_sequential_time = sum(latencies)
            speedup = theoretical_sequential_time / total_test_time
            print(f"Concurrency Speedup Factor: {speedup:.2f}x")
            print("  (If sequential, this batch would have taken ~" + f"{theoretical_sequential_time:.2f}s)" )
            print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_load_test())
