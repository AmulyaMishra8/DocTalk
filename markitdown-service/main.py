"""
NeuralHire — MarkItDown microservice.

A thin FastAPI wrapper around Microsoft's MarkItDown that converts uploaded
PDF resumes into Markdown. The Node/Express backend (or BullMQ producer) calls
this service per PDF; the returned Markdown is what gets queued for the AI layer.
"""

import logging
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from pydantic import BaseModel
from markitdown import MarkItDown
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("markitdown-service")

app = FastAPI(
    title="NeuralHire MarkItDown Service",
    description="Converts PDF resumes to Markdown via Microsoft MarkItDown.",
    version="0.1.0",
)

# MarkItDown is stateless and cheap to reuse across requests.
_converter = MarkItDown()

# Embedding model — loaded once at startup. 768-dim vectors match the pgvector
# schema (chunks.embedding vector(768)). No API key required.
_embed_model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")

# Accept PDFs primarily; MarkItDown handles more but the pipeline feeds PDFs.
ALLOWED_SUFFIXES = {".pdf"}
MAX_BYTES = 200 * 1024 * 1024  # 200 MB — large books can exceed 20 MB


class ConversionResult(BaseModel):
    filename: str
    success: bool
    markdown: str | None = None
    error: str | None = None


class BatchResponse(BaseModel):
    count: int
    succeeded: int
    failed: int
    results: list[ConversionResult]


def _convert_upload(file: UploadFile, data: bytes) -> ConversionResult:
    """Convert a single in-memory upload to Markdown, never raising."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        return ConversionResult(
            filename=file.filename or "unknown",
            success=False,
            error=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_SUFFIXES)}",
        )
    if len(data) > MAX_BYTES:
        return ConversionResult(
            filename=file.filename or "unknown",
            success=False,
            error=f"File exceeds {MAX_BYTES // (1024 * 1024)} MB limit.",
        )

    # MarkItDown infers the format from the file extension, so write to a temp
    # file with the right suffix rather than feeding a raw stream.
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        result = _converter.convert(tmp_path)
        return ConversionResult(
            filename=file.filename or "unknown",
            success=True,
            markdown=result.text_content,
        )
    except Exception as exc:  # noqa: BLE001 — surface per-file, keep batch going
        logger.exception("Conversion failed for %s", file.filename)
        return ConversionResult(
            filename=file.filename or "unknown",
            success=False,
            error=str(exc),
        )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """Embed a single piece of text. Returns a 768-dim normalised vector."""
    vector = _embed_model.encode(req.text, normalize_embeddings=True)
    return EmbedResponse(embedding=vector.tolist())


@app.post("/convert", response_model=ConversionResult)
async def convert(file: UploadFile = File(...)) -> ConversionResult:
    """Convert a single PDF to Markdown."""
    data = await file.read()
    result = _convert_upload(file, data)
    if not result.success:
        raise HTTPException(status_code=422, detail=result.model_dump())
    return result


@app.post("/convert/batch", response_model=BatchResponse)
async def convert_batch(files: list[UploadFile] = File(...)) -> BatchResponse:
    """Convert a batch/folder of PDFs. Per-file errors don't fail the batch."""
    results: list[ConversionResult] = []
    for file in files:
        data = await file.read()
        results.append(_convert_upload(file, data))

    succeeded = sum(1 for r in results if r.success)
    return BatchResponse(
        count=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded,
        results=results,
    )
