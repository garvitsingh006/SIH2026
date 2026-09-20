"""
image_utils.py
---------------
Turns the GeoTIFF outputs of gis_analytics.py into plain PNGs, so the
frontend can display results with a normal <img src="..."> tag instead
of needing a GeoTIFF-capable viewer in the browser.

The actual georeferenced .tif files are still written by
run_analytics_pipeline() and stay available for download/GIS use --
these PNGs are just a display-friendly side output.
"""

from __future__ import annotations

import numpy as np
import rasterio
import matplotlib

matplotlib.use("Agg")  # headless: no display backend needed on a server
import matplotlib.pyplot as plt
import matplotlib as mpl


def _percentile_stretch(arr: np.ndarray, low: float = 2, high: float = 98) -> np.ndarray:
    p_lo, p_hi = np.percentile(arr, (low, high))
    stretched = (arr - p_lo) / (p_hi - p_lo + 1e-8)
    return np.clip(stretched, 0.0, 1.0)


def save_rgb_preview(sr_array: np.ndarray, band_index: dict, out_path: str) -> str:
    """
    sr_array: (C, H, W) SR model output.
    band_index: same {"B04": i, ...} map used everywhere else in the pipeline.
    Writes a percentile-stretched true-color PNG and returns its path.
    """
    r = sr_array[band_index["B04"]]
    g = sr_array[band_index["B03"]]
    b = sr_array[band_index["B02"]]
    rgb = np.stack([r, g, b], axis=-1)
    rgb = _percentile_stretch(rgb)
    plt.imsave(out_path, rgb)
    return out_path


def save_index_preview(
    tif_path: str, out_path: str, cmap: str, vmin: float, vmax: float
) -> str:
    """
    Reads band 1 of a single-band GeoTIFF (NDVI / NDWI / confidence) and
    writes a color-mapped PNG. Returns the PNG path.
    """
    with rasterio.open(tif_path) as src:
        arr = src.read(1)
    norm = np.clip((arr - vmin) / (vmax - vmin + 1e-8), 0.0, 1.0)
    colored = mpl.colormaps[cmap](norm)
    plt.imsave(out_path, colored)
    return out_path