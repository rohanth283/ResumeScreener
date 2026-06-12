import os
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv
from jose import jwt
from google.oauth2 import id_token
from google.auth.transport import requests


import bcrypt

# Load environment variables in auth.py to prevent import timing bugs
load_dotenv(Path(__file__).resolve().parent / ".env")

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key-that-should-be-changed-in-prod-123456")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Google Client ID from environment
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_google_token(token: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID environment variable is not configured.")
    try:
        # Verify the Google ID token
        id_info = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        # Check issuer
        if id_info["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValueError("Invalid issuer.")
            
        return id_info
    except Exception as e:
        raise ValueError(f"Google ID token verification failed: {e}")


def create_password_reset_token(email: str, password_hash: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode = {
        "sub": email,
        "hash_suffix": password_hash[-10:] if password_hash else "",
        "purpose": "reset-password",
        "exp": expire
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def send_reset_email(email: str, token: str):
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM", "no-reply@localhost").strip()
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()

    reset_link = f"{frontend_url}/?view=reset-password&token={token}"
    subject = "Reset Your Password - Smart Resume Screener"
    body_text = f"Hello,\n\nPlease reset your password by clicking the link below:\n{reset_link}\n\nThis link will expire in 15 minutes."
    body_html = f"""<html>
<body>
  <p>Hello,</p>
  <p>Please reset your password by clicking the link below:</p>
  <p><a href="{reset_link}">{reset_link}</a></p>
  <p>This link will expire in 15 minutes.</p>
</body>
</html>"""

    if smtp_host:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = email

        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        try:
            server = smtplib.SMTP(smtp_host, smtp_port)
            if smtp_username and smtp_password:
                server.starttls()
                server.login(smtp_username, smtp_password)
            server.sendmail(smtp_from, [email], msg.as_string())
            server.quit()
            print(f"Password reset email sent successfully to {email} via SMTP.")
        except Exception as e:
            print(f"Failed to send email to {email} via SMTP: {e}")
            _log_email_locally(email, reset_link, body_text)
    else:
        _log_email_locally(email, reset_link, body_text)


def _log_email_locally(email: str, reset_link: str, body_text: str):
    import datetime
    log_content = f"""==================================================
Date: {datetime.datetime.utcnow().isoformat()}
To: {email}
Subject: Reset Your Password - Smart Resume Screener
Reset Link: {reset_link}
--------------------------------------------------
{body_text}
==================================================\n\n"""
    
    print(f"\n[EMAIL FALLBACK] Password reset email logged for {email}:\n{log_content}")
    
    log_file_path = Path(__file__).resolve().parent / "sent_emails.log"
    try:
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(log_content)
    except Exception as e:
        print(f"Failed to write reset email log: {e}")

