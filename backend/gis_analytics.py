"""
gis_analytics.py
----------------
Remote-sensing value-add module for the SEN2SR super-resolution pipeline.
SIH 2026 — PS 142 — Team Bable Bonkers

Implements the four things promised on Slides 2/3/5 of the deck:
  1. NDVI            -> compute_ndvi()
  2. NDWI            -> compute_ndwi()
  3. Confidence map  -> compute_confidence_map()   (TTA-based uncertainty)
  4. GeoTIFF writer  -> write_geotiff() / scale_transform()

Design note
-----------
The SR model output's channel order depends on which SEN2SR/SEN2SRLite
variant you load (e.g. NonReference_RGBN_x4 gives [B04,B03,B02,B08];
"main" reference model gives a different set of bands). Rather than
hardcoding indices, every function here takes either raw band arrays
directly, or a `band_index` dict you define once next to your model
load, e.g.:

    BAND_INDEX = {"B04": 0, "B03": 1, "B02": 2, "B08": 3}

so a wrong assumption about channel order fails loudly (KeyError)
instead of silently computing NDVI on the wrong band.
"""

from __future__ import annotations

from typing import Callable, Dict, Optional, Sequence, Tuple

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine

try:
    import torch
except ImportError:  # confidence map needs torch; indices/IO don't
    torch = None


# ============================================================
# 1. Spectral indices
# ============================================================

def compute_ndvi(nir: np.ndarray, red: np.ndarray, eps: float = 1e-8) -> np.ndarray:
    """
    NDVI = (NIR - Red) / (NIR + Red)

    Parameters
    ----------
    nir, red : (H, W) arrays, same shape. Reflectance (0-1) or raw DN both
        work since NDVI is a ratio; if you fed the model 0-1 reflectance,
        pass 0-1 reflectance here too for consistency.
    eps : avoids divide-by-zero over pure no-data / masked pixels.

    Returns
    -------
    (H, W) float32 array in [-1, 1]. >0.3-0.4 is typically vegetation.
    """
    nir = nir.astype(np.float32)
    red = red.astype(np.float32)
    ndvi = (nir - red) / (nir + red + eps)
    return np.clip(ndvi, -1.0, 1.0)


def compute_ndwi(green: np.ndarray, nir: np.ndarray, eps: float = 1e-8) -> np.ndarray:
    """
    NDWI (McFeeters 1996) = (Green - NIR) / (Green + NIR)

    Positive values -> open water / flood inundation. This is the index
    for the disaster/flood use case on Slide 5.
    """
    green = green.astype(np.float32)
    nir = nir.astype(np.float32)
    ndwi = (green - nir) / (green + nir + eps)
    return np.clip(ndwi, -1.0, 1.0)


def bands_from_index(
    array: np.ndarray, band_index: Dict[str, int], *names: str
) -> Tuple[np.ndarray, ...]:
    """
    Convenience accessor: pull named bands out of a (C, H, W) array using
    an explicit {band_name: channel_index} map, so callers never guess
    channel order.

    Example
    -------
    red, nir = bands_from_index(sr, BAND_INDEX, "B04", "B08")
    """
    return tuple(array[band_index[name]] for name in names)


# ============================================================
# 2. Confidence / uncertainty map (test-time augmentation)
# ============================================================
# Ground truth doesn't exist for real inference-time imagery, so PSNR/SSIM
# can't be computed per-pixel at deployment. TTA uncertainty is the
# standard proxy: run the model on several geometrically equivalent
# versions of the same input (flips/rotations), undo the geometry on the
# outputs, and measure pixel-wise disagreement. High disagreement =
# the model is "inventing" detail rather than reconstructing it
# consistently -> flags exactly the GAN-hallucination risk called out
# on Slide 4.

_TTA_OPS: Sequence[Tuple[str, Callable, Callable]] = (
    ("identity", lambda t: t, lambda t: t),
    ("hflip", lambda t: torch.flip(t, dims=[-1]), lambda t: torch.flip(t, dims=[-1])),
    ("vflip", lambda t: torch.flip(t, dims=[-2]), lambda t: torch.flip(t, dims=[-2])),
    (
        "rot180",
        lambda t: torch.flip(t, dims=[-2, -1]),
        lambda t: torch.flip(t, dims=[-2, -1]),
    ),
)


def compute_confidence_map(
    model,
    x: "torch.Tensor",
    device: Optional["torch.device"] = None,
    reduce: str = "mean",
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Run a small TTA ensemble through `model` and derive a per-pixel
    confidence map from prediction disagreement.

    Parameters
    ----------
    model : your loaded SEN2SR compiled model (already .eval()).
    x : input tensor, shape (1, C_in, H, W), already normalized/on device.
    device : torch device; inferred from `x` if omitted.
    reduce : "mean" (average uncertainty across output bands) or
        a specific band index (int) if you only care about one band,
        e.g. reduce=3 to look at NIR uncertainty only.

    Returns
    -------
    confidence : (H_out, W_out) float32 in [0, 1]. 1 = high agreement
        across augmentations (trust this pixel), 0 = low agreement
        (model-inferred / hallucination-prone region).
    raw_std : (H_out, W_out) float32, the un-normalized std this was
        derived from — keep this around if you want to compare
        confidence maps across different scenes/tiles (the 0-1
        normalization below is scene-relative).
    """
    if torch is None:
        raise ImportError("compute_confidence_map requires torch.")

    device = device or x.device
    model = model.to(device)
    x = x.to(device)

    preds = []
    with torch.no_grad():
        for name, forward_tf, inverse_tf in _TTA_OPS:
            x_t = forward_tf(x)
            y_t = model(x_t)
            y = inverse_tf(y_t)
            preds.append(y.squeeze(0).cpu().numpy())  # (C_out, H, W)

    stack = np.stack(preds, axis=0)  # (T, C_out, H, W)
    std = stack.std(axis=0)  # (C_out, H, W)

    if isinstance(reduce, int):
        unc = std[reduce]
    else:
        unc = std.mean(axis=0)  # (H, W)

    # Scene-relative normalization -> confidence in [0, 1].
    # Percentile clipping (not raw min/max) so a handful of outlier
    # pixels (border artifacts, single hot pixels) don't compress the
    # whole map's contrast toward 1.0.
    p_lo, p_hi = np.percentile(unc, (2, 98))
    unc_norm = (unc - p_lo) / (p_hi - p_lo + 1e-8)
    unc_norm = np.clip(unc_norm, 0.0, 1.0)
    confidence = (1.0 - unc_norm).astype(np.float32)

    return confidence, unc.astype(np.float32)


# ============================================================
# 3. GeoTIFF writer (scaled transform for super-resolved output)
# ============================================================

def scale_transform(src_transform: Affine, scale_factor: float) -> Affine:
    """
    Shrink pixel size by `scale_factor` while keeping the same
    top-left corner — i.e. turn a 10m/pixel transform into a
    (10/scale_factor)m/pixel transform (scale_factor=4 -> 2.5m).

    NOTE: this assumes the SR output covers the exact same ground
    footprint as the input tile (just at scale_factor times the
    pixel count per axis), which is the standard SEN2SR contract.
    """
    return Affine(
        src_transform.a / scale_factor, src_transform.b, src_transform.c,
        src_transform.d, src_transform.e / scale_factor, src_transform.f,
    )


def write_geotiff(
    path: str,
    array: np.ndarray,
    transform: Affine,
    crs: "CRS | str | int",
    band_names: Optional[Sequence[str]] = None,
    dtype: str = "float32",
    nodata: Optional[float] = None,
    compress: str = "deflate",
) -> None:
    """
    Write a (C, H, W) or (H, W) array to a georeferenced GeoTIFF.

    Parameters
    ----------
    path : output .tif path.
    array : (C, H, W) or (H, W). (H, W) is auto-promoted to 1 band.
    transform : the AFFINE TRANSFORM FOR THIS ARRAY'S OWN PIXEL GRID
        (i.e. already scaled — pass the output of scale_transform()
        here, not the original 10m transform).
    crs : e.g. rasterio.crs.CRS.from_epsg(32643), "EPSG:32643", or 32643.
    band_names : optional per-band descriptions (e.g. ["NDVI"] or
        ["B04_SR", "B03_SR", "B02_SR", "B08_SR"]).
    dtype : output dtype; float32 for indices/confidence, uint16 if you
        rescale reflectance bands back to DN-like integers.
    nodata : nodata value to encode in the profile, if any.
    compress : GDAL compression, "deflate" is a safe lossless default.
    """
    if array.ndim == 2:
        array = array[np.newaxis, ...]
    count, height, width = array.shape

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": count,
        "dtype": dtype,
        "crs": crs,
        "transform": transform,
        "compress": compress,
    }
    if nodata is not None:
        profile["nodata"] = nodata

    with rasterio.open(path, "w", **profile) as dst:
        dst.write(array.astype(dtype))
        if band_names:
            for i, name in enumerate(band_names, start=1):
                dst.set_band_description(i, name)


# ============================================================
# 4. Orchestrator — wire it all together for one SR tile
# ============================================================

def run_analytics_pipeline(
    sr_array: np.ndarray,
    band_index: Dict[str, int],
    src_transform: Affine,
    src_crs: "CRS | str | int",
    out_dir: str,
    tile_id: str,
    scale_factor: float = 4.0,
    confidence: Optional[np.ndarray] = None,
) -> Dict[str, str]:
    """
    Given one super-resolved tile, compute NDVI/NDWI, and write the
    enhanced image, NDVI, NDWI, and (optionally) the confidence map
    out as GeoTIFFs on the scaled 2.5m grid.

    Parameters
    ----------
    sr_array : (C, H, W) SR model output for this tile, numpy.
    band_index : {"B04": i, "B03": i, "B02": i, "B08": i, ...} — must
        contain at least B04 (red), B08 (NIR) for NDVI, and B03 (green)
        for NDWI. Match this to whatever SEN2SR variant you actually run.
    src_transform, src_crs : georeferencing of the *input* (10m) tile,
        read from the source Sentinel-2 scene with rasterio.
    out_dir : output directory (must exist).
    tile_id : used to name output files, e.g. "T43QGV_20260115".
    scale_factor : SR upscaling factor (4 -> 10m to 2.5m).
    confidence : optional (H, W) confidence map from compute_confidence_map(),
        already resampled/aligned to sr_array's grid if you computed it
        on a different tensor.

    Returns
    -------
    dict of {product_name: file_path} for whatever was written.
    """
    import os

    os.makedirs(out_dir, exist_ok=True)
    out_transform = scale_transform(src_transform, scale_factor)
    outputs: Dict[str, str] = {}

    # --- Enhanced RGB (or full stack) image ---
    rgb_path = os.path.join(out_dir, f"{tile_id}_SR_2p5m.tif")
    rgbn_names = [n for n in ("B04", "B03", "B02", "B08") if n in band_index]
    rgbn_stack = np.stack([sr_array[band_index[n]] for n in rgbn_names], axis=0)
    write_geotiff(rgb_path, rgbn_stack, out_transform, src_crs, band_names=rgbn_names)
    outputs["enhanced_image"] = rgb_path

    # --- NDVI ---
    if "B08" in band_index and "B04" in band_index:
        red, nir = bands_from_index(sr_array, band_index, "B04", "B08")
        ndvi = compute_ndvi(nir, red)
        ndvi_path = os.path.join(out_dir, f"{tile_id}_NDVI.tif")
        write_geotiff(ndvi_path, ndvi, out_transform, src_crs, band_names=["NDVI"])
        outputs["ndvi"] = ndvi_path

    # --- NDWI ---
    if "B03" in band_index and "B08" in band_index:
        green, nir = bands_from_index(sr_array, band_index, "B03", "B08")
        ndwi = compute_ndwi(green, nir)
        ndwi_path = os.path.join(out_dir, f"{tile_id}_NDWI.tif")
        write_geotiff(ndwi_path, ndwi, out_transform, src_crs, band_names=["NDWI"])
        outputs["ndwi"] = ndwi_path

    # --- Confidence map (if provided) ---
    if confidence is not None:
        conf_path = os.path.join(out_dir, f"{tile_id}_confidence.tif")
        write_geotiff(
            conf_path, confidence, out_transform, src_crs, band_names=["confidence"]
        )
        outputs["confidence"] = conf_path

    return outputs


# ============================================================
# 5. Example wiring against your existing inference script
# ============================================================
"""
BAND_INDEX = {"B04": 0, "B03": 1, "B02": 2, "B08": 3}  # <- set to match
                                                        #    YOUR model's
                                                        #    actual output
                                                        #    order (verify
                                                        #    from the model
                                                        #    card, don't guess)

# after: sr = model(X)                       # (1, C, H, W) tensor
sr_np = sr.squeeze(0).cpu().numpy()

confidence, raw_std = compute_confidence_map(model, X, device=device)

with rasterio.open("input_tile_10m.tif") as src:
    src_transform, src_crs = src.transform, src.crs

outputs = run_analytics_pipeline(
    sr_array=sr_np,
    band_index=BAND_INDEX,
    src_transform=src_transform,
    src_crs=src_crs,
    out_dir="outputs",
    tile_id="demo_tile_01",
    scale_factor=4.0,
    confidence=confidence,
)
print(outputs)
"""