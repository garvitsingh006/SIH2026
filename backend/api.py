"""
api.py
------
FastAPI wrapper around model.py + gis_analytics.py.

Endpoint contract (what the frontend will talk to):

    POST /api/super-resolve
        multipart/form-data, field "file" = a 10-band tile, either:
          - a SEN2VENuS-style "*_lr.npy" ((10,H,W) or (H,W,10)), OR
          - a GeoTIFF with >=10 bands in the order
            B04,B03,B02,B08,B05,B06,B07,B8A,B11,B12 (real Sentinel-2 tile
            -> gives real georeferencing instead of the placeholder grid)

        -> 200 JSON:
        {
          "job_id": "...",
          "is_real_georeferenced": true/false,
          "previews": {                # PNGs, ready for <img src=...>
            "enhanced_image_png": "/api/download/<job_id>/tile_SR_preview.png",
            "ndvi_png": "...", "ndwi_png": "...", "confidence_png": "..."
          },
          "geotiffs": {                 # georeferenced .tif, for download / GIS
            "enhanced_image": "...", "ndvi": "...", "ndwi": "...", "confidence": "..."
          }
        }

    GET /api/download/{job_id}/{filename}
        serves any file written for that job (PNG or GeoTIFF).

Run with:
    uvicorn api:app --reload --port 8000
"""

from __future__ import annotations

import io
import os
import uuid

import numpy as np
import torch
import rasterio
from rasterio.transform import Affine
from rasterio.crs import CRS
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from model import BAND_INDEX, load_model, run_inference
from gis_analytics import compute_confidence_map, run_analytics_pipeline
from image_utils import save_index_preview, save_rgb_preview

OUTPUT_ROOT = "outputs"
os.makedirs(OUTPUT_ROOT, exist_ok=True)

app = FastAPI(title="SEN2SR Super-Resolution API")

# Wide open for local dev with a not-yet-built frontend; tighten
# allow_origins to your actual frontend URL before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None
_device = None


@app.on_event("startup")
def _startup() -> None:
    # Load once at process start -- NOT per-request, since this is the
    # slow step (weight download/decompress + move to GPU).
    global _model, _device
    _model, _device = load_model()


def _read_input_array(filename: str, raw_bytes: bytes):
    """
    Parse an uploaded file into (lr_chw, src_transform, src_crs, is_real_georef).
    lr_chw: (10, H, W) float32, normalized to ~0-1 reflectance.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "npy":
        arr = np.load(io.BytesIO(raw_bytes)).astype(np.float32)
        if arr.shape[0] == 10:
            chw = arr
        elif arr.shape[-1] == 10:
            chw = np.transpose(arr, (2, 0, 1))
        else:
            raise ValueError(f"Expected a 10-band array, got shape {arr.shape}")

        chw[chw == 65535] = 0.0  # SEN2VENuS nodata sentinel
        if np.nanmax(chw) > 2:
            chw /= 10000.0
        chw = np.nan_to_num(chw, nan=0.0, posinf=0.0, neginf=0.0)

        # A bare .npy carries no real-world geolocation -- same placeholder
        # grid main.py uses, just so the GeoTIFFs are valid/openable.
        src_transform = Affine.translation(0, 0) * Affine.scale(10.0, -10.0)
        src_crs = CRS.from_epsg(32643)
        return chw, src_transform, src_crs, False

    elif ext in ("tif", "tiff"):
        with rasterio.MemoryFile(raw_bytes) as memfile:
            with memfile.open() as src:
                arr = src.read().astype(np.float32)  # (bands, H, W)
                src_transform = src.transform
                src_crs = src.crs

        if arr.shape[0] < 10:
            raise ValueError(
                f"Expected >=10 bands (B04,B03,B02,B08,B05,B06,B07,B8A,B11,B12), "
                f"got {arr.shape[0]}"
            )
        chw = arr[:10]
        if np.nanmax(chw) > 2:
            chw /= 10000.0
        chw = np.nan_to_num(chw, nan=0.0, posinf=0.0, neginf=0.0)
        return chw, src_transform, src_crs, True

    else:
        raise ValueError(
            f"Unsupported file type '.{ext}'. Upload a 10-band .npy or .tif tile."
        )


def _url_for(local_path: str) -> str:
    rel = os.path.relpath(local_path, OUTPUT_ROOT).replace(os.sep, "/")
    return f"/api/download/{rel}"


@app.post("/api/super-resolve")
async def super_resolve(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        lr_chw, src_transform, src_crs, is_real_georef = _read_input_array(
            file.filename or "", raw
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(OUTPUT_ROOT, job_id)
    os.makedirs(job_dir, exist_ok=True)

    X = torch.from_numpy(lr_chw).unsqueeze(0).to(_device)
    sr_np = run_inference(_model, lr_chw, _device)  # (10, 4H, 4W)
    confidence, _raw_std = compute_confidence_map(_model, X, device=_device)

    tif_paths = run_analytics_pipeline(
        sr_array=sr_np,
        band_index=BAND_INDEX,
        src_transform=src_transform,
        src_crs=src_crs,
        out_dir=job_dir,
        tile_id="tile",
        scale_factor=4.0,
        confidence=confidence,
    )

    png_paths = {
        "input_low_res_png": save_rgb_preview(
            lr_chw, BAND_INDEX, os.path.join(job_dir, "tile_LR_preview.png")
        ),
        "enhanced_image_png": save_rgb_preview(
            sr_np, BAND_INDEX, os.path.join(job_dir, "tile_SR_preview.png")
        ),
        "confidence_png": save_index_preview(
            tif_paths["confidence"],
            os.path.join(job_dir, "tile_confidence_preview.png"),
            cmap="viridis", vmin=0, vmax=1,
        ),
    }
    if "ndvi" in tif_paths:
        png_paths["ndvi_png"] = save_index_preview(
            tif_paths["ndvi"], os.path.join(job_dir, "tile_NDVI_preview.png"),
            cmap="RdYlGn", vmin=-1, vmax=1,
        )
    if "ndwi" in tif_paths:
        png_paths["ndwi_png"] = save_index_preview(
            tif_paths["ndwi"], os.path.join(job_dir, "tile_NDWI_preview.png"),
            cmap="Blues", vmin=-1, vmax=1,
        )

    return JSONResponse({
        "job_id": job_id,
        "is_real_georeferenced": is_real_georef,
        "previews": {k: _url_for(v) for k, v in png_paths.items()},
        "geotiffs": {k: _url_for(v) for k, v in tif_paths.items()},
    })


@app.get("/api/download/{job_id}/{filename}")
def download(job_id: str, filename: str):
    path = os.path.join(OUTPUT_ROOT, job_id, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@app.get("/api/health")
def health():
    return {"status": "ok", "device": str(_device)}