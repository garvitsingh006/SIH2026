"""
main.py
-------
Wires model.py (SEN2SR load + inference) to gis_analytics.py
(NDVI / NDWI / confidence / GeoTIFF export).
"""

from rasterio.transform import Affine
from rasterio.crs import CRS

from backend.model import load_model, run_inference, load_lr_sample, BAND_INDEX
from backend.gis_analytics import compute_confidence_map, run_analytics_pipeline

CACHE_DIR = "./content/sen2venus_cache"
OUT_DIR = "outputs"
TILE_ID = "demo_tile_01"

# ------------------------------------------------------------------
# Load model + one sample
# ------------------------------------------------------------------

model, device = load_model()
lr_chw = load_lr_sample(CACHE_DIR)

import torch
X = torch.from_numpy(lr_chw).unsqueeze(0).to(device)

sr_np = run_inference(model, lr_chw, device)  # (10, 4H, 4W)

# ------------------------------------------------------------------
# Confidence map (reuses the same model + input tensor)
# ------------------------------------------------------------------

confidence, raw_std = compute_confidence_map(model, X, device=device)

# ------------------------------------------------------------------
# Georeferencing
# ------------------------------------------------------------------
# SEN2VENuS *_lr.npy samples carry NO real-world CRS/transform -- they're
# stripped training pairs, not geolocated scenes. The placeholder below
# lets you exercise the full pipeline (correct pixel scaling, valid
# GeoTIFF, openable in QGIS) but the coordinates are NOT real locations.
#
# For your actual demo / judged output, replace this block with:
#   import rasterio
#   with rasterio.open("path/to/real_sentinel2_band.tif") as src:
#       src_transform, src_crs = src.transform, src.crs
# using a Sentinel-2 tile pulled from CDSE, which comes with real
# georeferencing.

src_transform = Affine.translation(0, 0) * Affine.scale(10.0, -10.0)  # 10m/pixel
src_crs = CRS.from_epsg(32643)  # placeholder UTM zone — swap for your real AOI's zone

# ------------------------------------------------------------------
# Run analytics: enhanced image, NDVI, NDWI, confidence -> GeoTIFFs
# ------------------------------------------------------------------

outputs = run_analytics_pipeline(
    sr_array=sr_np,
    band_index=BAND_INDEX,
    src_transform=src_transform,
    src_crs=src_crs,
    out_dir=OUT_DIR,
    tile_id=TILE_ID,
    scale_factor=4.0,
    confidence=confidence,
)

print("Wrote:")
for name, path in outputs.items():
    print(f"  {name}: {path}")