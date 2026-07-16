# NeuralHire — MarkItDown Microservice

FastAPI service that converts PDF resumes to Markdown using
[Microsoft MarkItDown](https://github.com/microsoft/markitdown). The Markdown it
returns is what gets pushed onto the BullMQ queue for the AI layer.

## Setup

```bash
cd markitdown-service
python -m venv .venv
.venv\Scripts\activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive docs at http://localhost:8000/docs

## Endpoints

| Method | Path             | Body                          | Returns |
|--------|------------------|-------------------------------|---------|
| GET    | `/health`        | —                             | `{"status": "ok"}` |
| POST   | `/convert`       | `file` (single PDF)           | `ConversionResult` |
| POST   | `/convert/batch` | `files` (multiple PDFs)       | `BatchResponse` (per-file errors don't fail the batch) |

### Example

```bash
curl -F "file=@resume.pdf" http://localhost:8000/convert
```

```json
{
  "filename": "resume.pdf",
  "success": true,
  "markdown": "# John Doe\n\n..."
}
```

## Notes

- Only `.pdf` is accepted; 20 MB per-file limit (both tweakable in `main.py`).
- `/convert` returns HTTP 422 on a failed single conversion; `/convert/batch`
  always returns 200 and reports per-file success/failure.
