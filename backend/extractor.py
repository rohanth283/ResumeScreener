import io

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract plain text from a PDF file."""
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts).strip()


def extract_text_from_txt(file_bytes: bytes) -> str:
    """Extract plain text from a .txt file."""
    for encoding in ("utf-8", "latin-1"):
        try:
            return file_bytes.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="replace").strip()


def extract_text(filename: str, file_bytes: bytes) -> str:
    """Extract text from a resume file based on its extension."""
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        text = extract_text_from_pdf(file_bytes)
    elif lower_name.endswith(".txt"):
        text = extract_text_from_txt(file_bytes)
    else:
        raise ValueError("Unsupported file type. Please upload a .pdf or .txt file.")

    if not text:
        raise ValueError("Could not extract any text from the uploaded file.")

    return text
