"""
model.py
--------
SEN2SRLite MAIN loading + inference, refactored into reusable functions.

Confirmed from actual output shape (10, 512, 512) on a (10, 128, 128)
input: this model upscales ALL 10 input bands by 4x, in the SAME channel
order they were fed in. The "Output: 6 super-resolved RSWIR bands" print
in earlier versions of this script was stale/wrong -- ignore it.

Channel order (both input AND output):
    0: B04   1: B03   2: B02   3: B08   4: B05
    5: B06   6: B07   7: B8A   8: B11   9: B12
"""

import os
import random

import numpy as np
import torch
import mlstac

MODEL_DIR = "./content/model/SEN2SRLite"
MODEL_URL = (
    "https://huggingface.co/tacofoundation/sen2sr/"
    "resolve/main/SEN2SRLite/main/mlm.json"
)

# Confirmed band order for this model's input AND output (see docstring above)
BAND_INDEX = {
    "B04": 0, "B03": 1, "B02": 2, "B08": 3, "B05": 4,
    "B06": 5, "B07": 6, "B8A": 7, "B11": 8, "B12": 9,
}


def _model_is_downloaded(model_dir: str) -> bool:
    mlm_path = os.path.join(model_dir, "mlm.json")
    if not os.path.exists(mlm_path):
        return False
    weight_files = [
        f for f in os.listdir(model_dir)
        if f.endswith(".safetensor") or f.endswith(".safetensors")
    ]
    return any(
        os.path.getsize(os.path.join(model_dir, f)) > 1_000_000
        for f in weight_files
    )


def load_model(model_dir: str = MODEL_DIR, model_url: str = MODEL_URL, device=None):
    """
    Download (if needed) and load the SEN2SRLite MAIN model.

    Returns
    -------
    model : the compiled, .eval()'d model, already moved to `device`.
    device : the torch.device it's on.
    """
    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Device:", device)

    os.makedirs(model_dir, exist_ok=True)

    if not _model_is_downloaded(model_dir):
        print("Model missing or incomplete — downloading...")
        mlstac.download(file=model_url, output_dir=model_dir)
    else:
        print("Model already present locally — skipping download.")

    model = mlstac.load(model_dir).compiled_model(device=device)
    model = model.to(device)
    model.eval()

    print("✅ SEN2SRLite MAIN loaded on", device)
    return model, device


def load_lr_sample(cache_dir: str, filename: str | None = None) -> np.ndarray:
    """
    Load one (10, H, W) low-res sample from a SEN2VENuS-style cache dir
    of *_lr.npy files, normalized to 0-1 reflectance. Picks a random
    file if `filename` isn't given.

    Returns
    -------
    (10, H, W) float32 numpy array, ready to hand to run_inference().
    """
    lr_files = [f for f in os.listdir(cache_dir) if f.endswith("_lr.npy")]
    if not lr_files:
        raise FileNotFoundError(f"No *_lr.npy files found in {cache_dir}")

    lr_file = filename or random.choice(lr_files)
    lr_path = os.path.join(cache_dir, lr_file)
    print("Selected:", lr_file)

    lr = np.load(lr_path).astype(np.float32)

    if lr.shape[0] == 10:
        lr_chw = lr
    elif lr.shape[-1] == 10:
        lr_chw = np.transpose(lr, (2, 0, 1))
    else:
        raise ValueError(f"Expected 10-band image, got {lr.shape}")

    lr_chw[lr_chw == 65535] = 0  # SEN2VENuS nodata sentinel
    if np.nanmax(lr_chw) > 2:
        lr_chw /= 10000.0
    lr_chw = np.nan_to_num(lr_chw, nan=0.0, posinf=0.0, neginf=0.0)

    return lr_chw


def run_inference(model, lr_chw: np.ndarray, device) -> np.ndarray:
    """
    Run the model on a (10, H, W) low-res array.

    Returns
    -------
    (10, 4H, 4W) float32 numpy array, same band order as input
    (see BAND_INDEX above).
    """
    X = torch.from_numpy(lr_chw).unsqueeze(0).to(device)
    with torch.no_grad():
        sr = model(X)
    return sr.squeeze(0).cpu().numpy()


if __name__ == "__main__":
    # Quick standalone smoke test: python model.py
    model, device = load_model()
    lr_chw = load_lr_sample("./sen2venus_cache")
    sr = run_inference(model, lr_chw, device)
    print("Input :", lr_chw.shape)
    print("Output:", sr.shape)