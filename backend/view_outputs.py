"""
view_outputs.py
---------------
Quick visual sanity-check of the GeoTIFFs written by main.py.
Not for judged demo screenshots -- just to confirm the pipeline worked.

Run: python view_outputs.py
"""

import numpy as np
import rasterio
import matplotlib.pyplot as plt

OUT_DIR = "outputs"
TILE_ID = "demo_tile_01"


def read_band(path, band=1):
    with rasterio.open(path) as src:
        return src.read(band)


def percentile_stretch(arr, low=2, high=98):
    p_lo, p_hi = np.percentile(arr, (low, high))
    stretched = (arr - p_lo) / (p_hi - p_lo + 1e-8)
    return np.clip(stretched, 0, 1)


fig, axes = plt.subplots(1, 4, figsize=(20, 5))

# --- Enhanced RGB (bands 1,2,3 in the file = B04,B03,B02) ---
with rasterio.open(f"{OUT_DIR}/{TILE_ID}_SR_2p5m.tif") as src:
    rgb = src.read([1, 2, 3])  # (3, H, W) = R, G, B
rgb = np.transpose(rgb, (1, 2, 0))
rgb = percentile_stretch(rgb)
axes[0].imshow(rgb)
axes[0].set_title("Enhanced RGB (2.5m)")
axes[0].axis("off")

# --- NDVI ---
ndvi = read_band(f"{OUT_DIR}/{TILE_ID}_NDVI.tif")
im1 = axes[1].imshow(ndvi, cmap="RdYlGn", vmin=-1, vmax=1)
axes[1].set_title("NDVI")
axes[1].axis("off")
fig.colorbar(im1, ax=axes[1], fraction=0.046)

# --- NDWI ---
ndwi = read_band(f"{OUT_DIR}/{TILE_ID}_NDWI.tif")
im2 = axes[2].imshow(ndwi, cmap="Blues", vmin=-1, vmax=1)
axes[2].set_title("NDWI")
axes[2].axis("off")
fig.colorbar(im2, ax=axes[2], fraction=0.046)

# --- Confidence ---
conf = read_band(f"{OUT_DIR}/{TILE_ID}_confidence.tif")
im3 = axes[3].imshow(conf, cmap="viridis", vmin=0, vmax=1)
axes[3].set_title("Confidence")
axes[3].axis("off")
fig.colorbar(im3, ax=axes[3], fraction=0.046)

plt.tight_layout()
plt.savefig(f"{OUT_DIR}/{TILE_ID}_preview.png", dpi=150)
print(f"Saved preview to {OUT_DIR}/{TILE_ID}_preview.png")
plt.show()