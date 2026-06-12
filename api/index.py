import sys
import os

# Add backend directory to sys.path so we can import modules correctly
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app
