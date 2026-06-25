---
name: resume_screener_reviewer
description: Enforces code quality, database safety, and design rules for the Resume-Screener project.
triggers:
  - user asks to review changes
  - user asks to check code style or quality
---

# Resume-Screener Coding Standards

When analyzing or modifying code in this repository, always adhere to and enforce the following rules:

### 1. Database Safety & Session Management
- **SQL Queries**: Never write raw concatenated SQL strings. Enforce SQLAlchemy parameterized query builders.
- **Deduplication**: Keep deduplication logic in the database (SQL/CTE window functions) rather than in-memory Python code to ensure scalability.
- **Relationship Loading**: Use `joinedload` on relationships (e.g., `models.Applicant.job`) to prevent N+1 lazy loading queries.
- **ORM Mutation Isolation**: Never mutate attributes of managed database session objects directly in GET routes. Convert models to Pydantic responses before returning.

### 2. Timezone Integrity
- Always use timezone-neutral string parses (e.g. splitting `YYYY-MM-DD` and manually constructing dates) instead of parsing raw date strings using the local browser's timezone.
- Compare dates using UTC midnights (`Date.UTC` or ISO strings with `Z`).

### 3. Frontend Architecture & Design
- **Accessibility**: Enforce keyboard accessibility (`tabIndex={0}` and event triggers for `Enter` / `Space` / `Esc`) on custom controls like the `DatePicker`.
- **Portal Rendering**: Render overlay dropdowns using React Portals (`createPortal` targeting `document.body`) to prevent parent layout container clipping.
- **Icons**: Never use raw emojis in UI text. Use unified inline SVG React icons (defined in `Icons.jsx`) aligned via the `.flex-icon-align` CSS class.
