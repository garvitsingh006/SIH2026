"""
load_sentinel2_scene.py
------------------------
Load a real Sentinel-2 L2A scene downloaded from Copernicus Data Space
Ecosystem (CDSE) as a .SAFE product, and produce the 10-band, 10m-grid
tensor + REAL transform/CRS that model.py and gis_analytics.py expect.

This replaces the SEN2VENuS *_lr.npy / placeholder-transform route
entirely -- everything downstream (SR, NDVI, NDWI, confidence,
GeoTIFF export) now works on genuinely geolocated data.

Usage
-----
    from load_sentinel2_scene import load_sentinel2_tile

    tile, transform, crs = load_sentinel2_tile(
        safe_dir="S2A_MSIL2A_20260115T...SAFE",
        crop_size=128,
    )
    # tile: (10, 128, 128) float32, 0-1 reflectance, band order matches
    #       model.BAND_INDEX (B04,B03,B02,B08,B05,B06,B07,B8A,B11,B12)
    # transform, crs: real georeferencing for THIS crop, ready to hand
    #                 straight to gis_analytics.run_analytics_pipeline()
"""

from __future__ import annotations

import glob
import os
from typing import Optional, Tuple

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window
from rasterio.windows import transform as window_transform

# Band -> (native resolution folder, filename suffix)
_BAND_SPECS = {
    "B04": ("R10m", "B04_10m"),
    "B03": ("R10m", "B03_10m"),
    "B02": ("R10m", "B02_10m"),
    "B08": ("R10m", "B08_10m"),
    "B05": ("R20m", "B05_20m"),
    "B06": ("R20m", "B06_20m"),
    "B07": ("R20m", "B07_20m"),
    "B8A": ("R20m", "B8A_20m"),
    "B11": ("R20m", "B11_20m"),
    "B12": ("R20m", "B12_20m"),
}

# Same order as model.BAND_INDEX -- keep these in sync
BAND_ORDER = ["B04", "B03", "B02", "B08", "B05", "B06", "B07", "B8A", "B11", "B12"]

# Sen2Cor processing baseline >= 04.00 (roughly since Jan 2022) adds a
# -1000 DN offset before scaling, to allow encoding slightly negative
# reflectance. If your product's baseline is >= 04.00, set this to 1000
# so it gets subtracted before the /10000 scaling. Check MTD_MSIL2A.xml
# in the .SAFE root (<BOA_ADD_OFFSET> tag) if you're unsure, or if
# reflectance values look implausibly high/low after loading.
BOA_ADD_OFFSET = 0


def _find_band_file(safe_dir: str, band: str) -> str:
    res_folder, suffix = _BAND_SPECS[band]
    pattern = os.path.join(safe_dir, "GRANULE", "*", "IMG_DATA", res_folder, f"*_{suffix}.jp2")
    matches = glob.glob(pattern)
    if not matches:
        raise FileNotFoundError(
            f"Could not find {band} under {pattern}. Check this is an L2A "
            f"product (not L1C, which has a different folder layout)."
        )
    return matches[0]


def load_sentinel2_tile(
    safe_dir: str,
    crop_size: Optional[int] = 128,
    row_off: Optional[int] = None,
    col_off: Optional[int] = None,
) -> Tuple[np.ndarray, "rasterio.Affine", "rasterio.crs.CRS"]:
    """
    Load one crop of a Sentinel-2 L2A .SAFE product as a (10, H, W)
    reflectance tensor on the 10m grid, with real transform/CRS.

    Parameters
    ----------
    safe_dir : path to the unzipped ...SAFE folder.
    crop_size : side length (pixels, at 10m) of the square crop to read.
        Pass None to read the FULL scene at 10m (large -- ~10980x10980
        for a full tile; use predict_large-style tiling downstream if
        you do this).
    row_off, col_off : top-left corner of the crop, in 10m-grid pixels.
        Defaults to the center of the scene if omitted.

    Returns
    -------
    tile : (10, H, W) float32, 0-1 reflectance, band order = BAND_ORDER.
    transform : real Affine transform for THIS crop (10m/pixel).
    crs : the scene's CRS (a UTM zone, e.g. EPSG:32643).
    """
    # Use a 10m band to establish the reference grid + full scene size.
    ref_path = _find_band_file(safe_dir, "B04")
    with rasterio.open(ref_path) as ref:
        full_h, full_w = ref.height, ref.width
        crs = ref.crs

        if crop_size is None:
            window = Window(0, 0, full_w, full_h)
        else:
            if row_off is None:
                row_off = (full_h - crop_size) // 2
            if col_off is None:
                col_off = (full_w - crop_size) // 2
            window = Window(col_off, row_off, crop_size, crop_size)

        crop_transform = window_transform(window, ref.transform)
        out_h, out_w = int(window.height), int(window.width)

    bands = []
    for band in BAND_ORDER:
        path = _find_band_file(safe_dir, band)
        res_folder = _BAND_SPECS[band][0]

        with rasterio.open(path) as src:
            if res_folder == "R10m":
                arr = src.read(1, window=window)
            else:
                # 20m band: this file is at half the 10m grid's resolution
                # over the SAME extent -- scale the window down by 2 and
                # resample while reading, straight up to the 10m grid.
                scale = 2
                win20 = Window(
                    window.col_off / scale, window.row_off / scale,
                    window.width / scale, window.height / scale,
                )
                arr = src.read(
                    1,
                    window=win20,
                    out_shape=(out_h, out_w),
                    resampling=Resampling.bilinear,
                )
        bands.append(arr)

    tile = np.stack(bands, axis=0).astype(np.float32)

    # DN -> reflectance
    if BOA_ADD_OFFSET:
        tile -= BOA_ADD_OFFSET
    tile = tile / 10000.0
    tile = np.clip(tile, 0.0, 1.0)
    tile = np.nan_to_num(tile, nan=0.0, posinf=0.0, neginf=0.0)

    return tile, crop_transform, crs


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python load_sentinel2_scene.py <path_to_.SAFE_folder>")
        sys.exit(1)

    tile, transform, crs = load_sentinel2_tile(sys.argv[1], crop_size=128)
    print("Tile shape:", tile.shape)
    print("Reflectance range:", tile.min(), "-", tile.max())
    print("Transform:", transform)
    print("CRS:", crs)