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


def send_email(to_email: str, subject: str, body_text: str, body_html: Optional[str] = None) -> str:
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM", "no-reply@localhost").strip()

    # Always log locally for development/test inspection when not running on Vercel
    if os.getenv("VERCEL") != "1":
        _log_email_locally(to_email, subject, body_text)

    if smtp_host:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = to_email

        msg.attach(MIMEText(body_text, "plain"))
        if body_html:
            msg.attach(MIMEText(body_html, "html"))

        try:
            server = smtplib.SMTP(smtp_host, smtp_port)
            if smtp_username and smtp_password:
                server.starttls()
                server.login(smtp_username, smtp_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())
            server.quit()
            print(f"Email sent successfully to {to_email} via SMTP.")
            return "smtp_sent"
        except Exception as e:
            print(f"Failed to send email to {to_email} via SMTP: {e}")
            if os.getenv("VERCEL") == "1":
                # Ephemeral fallback log on Vercel
                _log_email_locally(to_email, subject, body_text)
            raise e
    else:
        if os.getenv("VERCEL") == "1":
            _log_email_locally(to_email, subject, body_text)
            return "fallback_logged_to_console"
        return "fallback_logged_locally"


def send_reset_email(email: str, token: str) -> str:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()
    reset_link = f"{frontend_url}/?view=reset-password&token={token}"
    subject = "Reset Your Password - Smart Resume Screener"
    
    body_text = (
        f"Hello,\n\n"
        f"We received a request to reset the password for your account on Smart Resume Screener.\n\n"
        f"Please reset your password by clicking the link below:\n"
        f"{reset_link}\n\n"
        f"This link will expire in 15 minutes. If you did not request this, you can safely ignore this email.\n\n"
        f"Best regards,\n"
        f"The Smart Resume Screener Team"
    )
    
    body_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }}
    .wrapper {{
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 0;
    }}
    .container {{
      max-width: 540px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }}
    h2 {{
      color: #1e293b;
      font-size: 22px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 20px;
    }}
    p {{
      color: #475569;
      font-size: 15px;
      line-height: 1.6;
      margin-top: 0;
      margin-bottom: 24px;
    }}
    .btn-container {{
      text-align: center;
      margin-bottom: 30px;
      margin-top: 30px;
    }}
    .btn-primary {{
      display: inline-block;
      background-color: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
    }}
    .footer {{
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <h2>Reset Your Password</h2>
      <p>Hello,</p>
      <p>We received a request to reset the password for your account. Click the button below to choose a new password:</p>
      <div class="btn-container">
        <a href="{reset_link}" class="btn-primary">Reset Password</a>
      </div>
      <p>If the button above does not work, copy and paste the link below into your web browser:</p>
      <p style="word-break: break-all; font-size: 13px; color: #6366f1; background-color: #f1f5f9; padding: 12px; border-radius: 6px; margin-bottom: 24px;">
        <a href="{reset_link}" style="color: #6366f1; text-decoration: none;">{reset_link}</a>
      </p>
      <p>This password reset link is valid for <strong>15 minutes</strong>. If you did not request this password reset, please ignore this email.</p>
      <div class="footer">
        <p>Best regards,<br><strong>Smart Resume Screener Team</strong></p>
      </div>
    </div>
  </div>
</body>
</html>"""
    return send_email(email, subject, body_text, body_html)


def _log_email_locally(email: str, subject: str, body_text: str):
    import datetime
    log_content = f"""==================================================
Date: {datetime.datetime.utcnow().isoformat()}
To: {email}
Subject: {subject}
--------------------------------------------------
{body_text}
==================================================\n\n"""
    
    print(f"\n[EMAIL FALLBACK] Email logged for {email}:\n{log_content}")
    
    log_file_path = Path(__file__).resolve().parent / "sent_emails.log"
    try:
        with open(log_file_path, "a", encoding="utf-8") as f:
            f.write(log_content)
    except Exception as e:
        print(f"Failed to write email log: {e}")

