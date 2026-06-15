import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from dotenv import load_dotenv

# Load env variables
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

def test_smtp():
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM", smtp_username).strip()
    
    print("--- SMTP Configuration ---")
    print(f"Host: {smtp_host}")
    print(f"Port: {smtp_port}")
    print(f"Username: {smtp_username}")
    print(f"Password: {'*' * len(smtp_password) if smtp_password else '(Not set)'}")
    print(f"From Address: {smtp_from}")
    print("--------------------------")
    
    if not smtp_host:
        print("ERROR: SMTP_HOST is not set. Please add it to your environment or .env file.")
        return

    # Create a test message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "SMTP Test - Smart Resume Screener"
    msg["From"] = smtp_from
    msg["To"] = smtp_username  # Send to yourself
    
    body = "This is a test email to verify your SMTP configuration."
    msg.attach(MIMEText(body, "plain"))
    
    try:
        print("Connecting to SMTP server...")
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        
        if smtp_username and smtp_password:
            print("Starting TLS session...")
            server.starttls()
            print("Logging in...")
            server.login(smtp_username, smtp_password)
            
        print(f"Sending test email to {smtp_username}...")
        server.sendmail(smtp_from, [smtp_username], msg.as_string())
        server.quit()
        print("\nSUCCESS! Test email sent successfully.")
    except Exception as e:
        print(f"\nERROR: SMTP connection or sending failed: {e}")

if __name__ == "__main__":
    test_smtp()
