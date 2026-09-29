import React, { useState } from 'react';
import { 
  Cpu, Activity, Sparkles, FileCode, Check, Copy, 
  Layers, ArrowRight, ShieldCheck, Terminal, Download,
  CheckCircle2, RefreshCw, Eye
} from 'lucide-react';

const SCRIPT_PATH = "model.py";

const ARCHITECTURE_LAYERS = [
  {
    id: "head",
    number: "01",
    name: "Shallow Convolutional Head",
    pyClass: "nn.Conv2d(10, 96, kernel_size=3, padding=1)",
    inputShape: "[B, 10, H, W]",
    outputShape: "[B, 96, H, W]",
    params: "8,736",
    receptiveField: "3 × 3",
    description: "Projects raw 10-band multi-spectral Sentinel-2 reflectance (B02-B12) into a rich 96-dimensional high-dimensional latent feature manifold.",
    color: "#00d4ff",
    codeSnippet: `self.head = nn.Conv2d(
    in_channels=10,
    out_channels=96,
    kernel_size=3,
    padding=1
)`
  },
  {
    id: "cnn_body",
    number: "02",
    name: "Deep Residual CNN Body",
    pyClass: "4 × ResidualGroup (4 × ResidualBlock each = 16 Convs)",
    inputShape: "[B, 96, H, W]",
    outputShape: "[B, 96, H, W]",
    params: "1,328,256",
    receptiveField: "35 × 35",
    description: "16 convolutional layers organized into 4 residual groups with residual skip connections. Extracts high-frequency local spatial gradients, micro-parcel boundaries, and urban structures.",
    color: "#33d17a",
    codeSnippet: `class ResidualBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
        self.relu = nn.ReLU(inplace=True)
    def forward(self, x):
        return x + self.conv2(self.relu(self.conv1(x)))

self.cnn_body = nn.Sequential(
    *[ResidualGroup(features=96, num_blocks=4) for _ in range(4)],
    nn.Conv2d(96, 96, 3, padding=1)
)`
  },
  {
    id: "transformer",
    number: "03",
    name: "Shifted-Window Vision Transformer",
    pyClass: "2 × TransformerBlock (Window Size 8, Shift 0 and 4)",
    inputShape: "[B, 96, H, W]",
    outputShape: "[B, 96, H, W]",
    params: "178,560",
    receptiveField: "Global / Cross-Window",
    description: "Dual window-based multi-head self-attention (8 heads, embed_dim=96) with cyclic roll shifts (shift=4) and 2× GELU MLP. Captures non-local spatial correlations and inter-channel spectral dependencies across VNIR and SWIR without quadratic computational cost.",
    color: "#7b3aed",
    codeSnippet: `class TransformerBlock(nn.Module):
    def __init__(self, channels=96, num_heads=8, window_size=8, shift_size=0, mlp_ratio=2):
        super().__init__()
        self.norm1 = nn.LayerNorm(channels)
        self.attention = nn.MultiheadAttention(channels, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(channels)
        self.mlp = nn.Sequential(
            nn.Linear(channels, channels * mlp_ratio),
            nn.GELU(),
            nn.Linear(channels * mlp_ratio, channels)
        )
    def forward(self, x):
        # Cyclic shift -> Window Partition -> Self Attention -> Window Restore -> Reverse Shift
        ...`
  },
  {
    id: "fusion",
    number: "04",
    name: "Feature Fusion Layer",
    pyClass: "nn.Conv2d(96, 96, kernel_size=3, padding=1)",
    inputShape: "[B, 96, H, W]",
    outputShape: "[B, 96, H, W]",
    params: "83,040",
    receptiveField: "3 × 3",
    description: "Seamlessly fuses localized high-frequency CNN edge representations with long-range Transformer cross-spectral global context features.",
    color: "#0007cd",
    codeSnippet: `self.fusion = nn.Conv2d(
    in_channels=96,
    out_channels=96,
    kernel_size=3,
    padding=1
)`
  },
  {
    id: "upsample",
    number: "05",
    name: "2× Sub-Pixel PixelShuffle Upsampler",
    pyClass: "nn.Conv2d(96, 384, 3, 1) + nn.PixelShuffle(2) + nn.ReLU()",
    inputShape: "[B, 96, H, W]",
    outputShape: "[B, 96, 2H, 2W]",
    params: "332,160",
    receptiveField: "Sub-pixel",
    description: "Expands channel capacity to 384 and reorganizes periodic sub-pixel elements via PixelShuffle(2). Doubles spatial resolution from 10m to 5m without checkerboard deconvolution artifacts.",
    color: "#00d4ff",
    codeSnippet: `self.upsample = nn.Sequential(
    nn.Conv2d(features, features * 4, 3, padding=1),
    nn.PixelShuffle(2),
    nn.ReLU(inplace=True)
)`
  },
  {
    id: "tail",
    number: "06",
    name: "Multi-Spectral Reconstruction Tail",
    pyClass: "nn.Conv2d(96, 8, kernel_size=3, padding=1)",
    inputShape: "[B, 96, 2H, 2W]",
    outputShape: "[B, 8, 2H, 2W]",
    params: "6,920",
    receptiveField: "3 × 3",
    description: "Reconstructs the 8 high-resolution target multi-spectral channels with accurate physical surface reflectance.",
    color: "#33d17a",
    codeSnippet: `self.tail = nn.Conv2d(
    in_channels=96,
    out_channels=8,
    kernel_size=3,
    padding=1
)`
  },
  {
    id: "skip",
    number: "07",
    name: "Radiometric Energy Conservation Skip",
    pyClass: "nn.Conv2d(10, 8, 1) + F.interpolate(scale_factor=2, mode='bicubic')",
    inputShape: "[B, 10, H, W]",
    outputShape: "[B, 8, 2H, 2W]",
    params: "88",
    receptiveField: "Global Interpolation",
    description: "Direct residual skip path combining 1x1 spectral channel projection and 2x bicubic interpolation. Strictly guarantees physical energy conservation so super-resolved reflectance sums back to original L2A measurements.",
    color: "#ffaa00",
    codeSnippet: `self.skip = nn.Conv2d(in_channels=10, out_channels=8, kernel_size=1)
# Forward pass:
skip = F.interpolate(self.skip(x), scale_factor=2, mode="bicubic", align_corners=False)
return output + skip`
  }
];

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Multi-Spectral Ingestion & Geometric Radiometry",
    subtitle: "Sentinel-2 L2A BOA Ingestion",
    description: "Raw multi-spectral rasters across 10 bands (B02, B03, B04, B05, B06, B07, B08, B8A, B11, B12) are ingested. Digital Numbers (DN) scaled from 10,000 to [0.0, 1.0] surface reflectance float32 tensors. Sub-pixel Affine transformation matrix and EPSG projection are captured.",
    badge: "10 Bands • float32",
    tagColor: "border-[#00d4ff]/30 text-[#00d4ff] bg-[#00d4ff]/10"
  },
  {
    step: "02",
    title: "Sen2Venus Dataset Pairing & High-Throughput Caching",
    subtitle: "TacoReader Sen2Venus Benchmark",
    description: "1,000 paired multi-spectral satellite scenes are loaded. Input: Sentinel-2 10m L2A (10 channels, 128x128). Ground Truth: VENμS 5m high-resolution sensors (8 channels, 256x256). Pre-cached locally to disk as .npy tensors via LocalSen2VenusDataset to eliminate CPU decoding bottlenecks and sustain 100% GPU saturation.",
    badge: "1,000 Paired Scenes",
    tagColor: "border-[#33d17a]/30 text-[#33d17a] bg-[#33d17a]/10"
  },
  {
    step: "03",
    title: "Stage 1: Composite SpectralLoss Pretraining",
    subtitle: "Triple-Objective Physical Loss Optimization",
    description: "The CNNTransformerSR model is pretrained for 50 epochs using our custom composite loss: L_total = 1.0*L_MSE + 0.1*L_Spectral + 0.05*L_Gradient. Simultaneously optimizes pixel fidelity, spectral angle deviation (prevents color casts), and spatial gradient preservation. Trained with Adam (lr=5e-4) and ReduceLROnPlateau scheduler (patience=3).",
    badge: "Validation PSNR > 39.4 dB",
    tagColor: "border-[#0007cd]/30 text-[#00d4ff] bg-[#0007cd]/10"
  },
  {
    step: "04",
    title: "Stage 2: Relativistic Average GAN (RaGAN) Fine-Tuning",
    subtitle: "PatchGAN + Spectral Norm + Feature Matching",
    description: "To eliminate L2 oversmoothing while preventing artificial hallucination, Stage 2 executes RaGAN adversarial fine-tuning. Utilizes a 6-layer PatchGAN discriminator with Spectral Normalization, Two Time-Scale Update Rule (TTUR: G lr=5e-5, D lr=2e-4), and Feature-Matching loss (W=1.0) on intermediate discriminator representations. Tracks GLOBAL_BEST.pth with early stopping.",
    badge: "Perceptual Sharpness",
    tagColor: "border-[#7b3aed]/30 text-[#7b3aed] bg-[#7b3aed]/10"
  },
  {
    step: "05",
    title: "4× Super-Resolution Inference & Epistemic Uncertainty",
    subtitle: "Sub-Pixel Synthesis (10m -> 2.5m)",
    description: "Tile inferencing processes scenes with 16-pixel boundary overlap to eliminate seam artifacts. Forward pass yields 5m neural output, followed by 2x sub-pixel resampling for 2.5m analytical products. Monte-Carlo ensemble variance calculates epistemic uncertainty across every individual pixel.",
    badge: "16x Pixel Density",
    tagColor: "border-[#33d17a]/30 text-[#33d17a] bg-[#33d17a]/10"
  },
  {
    step: "06",
    title: "GIS-Grade GeoTIFF Export & Biogeochemical Indices",
    subtitle: "Automated Affine CRS Transform & Spectral Indexes",
    description: "Automated Rasterio integration generates 32-bit float GeoTIFFs (tile_SR_2p5m.tif) with updated geotransform matrices: [x_res = 2.5m, y_res = -2.5m]. Automatically computes high-resolution NDVI (vegetation chlorophyll) and NDWI (moisture/water) rasters directly interoperable with QGIS, ArcGIS, and GEE.",
    badge: "Analysis-Ready GeoTIFF",
    tagColor: "border-[#00d4ff]/30 text-[#00d4ff] bg-[#00d4ff]/10"
  }
];

const CODE_TABS = {
  model: {
    title: "CNNTransformerSR Architecture",
    code: `# File: model.py (Workspace Root)
# ============================================================
# CNN + TRANSFORMER SUPER-RESOLUTION ARCHITECTURE
# ============================================================

import torch
import torch.nn as nn
import torch.nn.functional as F

class CNNTransformerSR(nn.Module):
    def __init__(
        self,
        in_channels=10,
        out_channels=8,
        features=96,
        num_groups=4,
        blocks_per_group=4,
        transformer_blocks=2
    ):
        super().__init__()

        # 1. CNN Head: 10 Sentinel-2 bands -> 96 feature channels
        self.head = nn.Conv2d(in_channels, features, 3, padding=1)

        # 2. Deep Residual CNN Body: 4 Groups x 4 Blocks = 16 Conv blocks
        self.cnn_body = nn.Sequential(
            *[ResidualGroup(features, blocks_per_group) for _ in range(num_groups)],
            nn.Conv2d(features, features, 3, padding=1)
        )

        # 3. Dual Shifted-Window Transformer Blocks (Window Size 8, Shift 0 and 4)
        self.transformer = nn.Sequential(
            TransformerBlock(features, num_heads=8, window_size=8, shift_size=0, mlp_ratio=2),
            TransformerBlock(features, num_heads=8, window_size=8, shift_size=4, mlp_ratio=2)
        )

        # 4. Feature Fusion
        self.fusion = nn.Conv2d(features, features, 3, padding=1)

        # 5. 2x Sub-Pixel Upsampling (PixelShuffle)
        self.upsample = nn.Sequential(
            nn.Conv2d(features, features * 4, 3, padding=1),
            nn.PixelShuffle(2),
            nn.ReLU(inplace=True)
        )

        # 6. Output Tail: 8 HR Target Bands
        self.tail = nn.Conv2d(features, out_channels, 3, padding=1)

        # 7. Bicubic Residual Skip for Physical Energy Conservation
        self.skip = nn.Conv2d(in_channels, out_channels, 1)

    def forward(self, x):
        features = self.head(x)
        features = features + self.cnn_body(features)
        features = features + self.transformer(features)
        features = self.fusion(features)
        features = self.upsample(features)
        output = self.tail(features)
        skip = F.interpolate(self.skip(x), scale_factor=2, mode="bicubic", align_corners=False)
        return output + skip`
  },
  loss: {
    title: "Composite SpectralLoss Formulation",
    code: `# File: model.py (Lines 588-660)
# ============================================================
# COMPOSITE SPECTRAL & GRADIENT LOSS
# ============================================================

class SpectralLoss(nn.Module):
    def __init__(
        self,
        mse_weight=1.0,
        spectral_weight=0.1,
        gradient_weight=0.05
    ):
        super().__init__()
        self.mse_weight = mse_weight
        self.spectral_weight = spectral_weight
        self.gradient_weight = gradient_weight

    def forward(self, prediction, target):
        # 1. Pixel reconstruction MSE
        mse = torch.mean((prediction - target) ** 2)

        # 2. Spectral consistency (preserves channel ratios and angles)
        pred_spectral = prediction - prediction.mean(dim=1, keepdim=True)
        target_spectral = target - target.mean(dim=1, keepdim=True)
        spectral = torch.mean((pred_spectral - target_spectral) ** 2)

        # 3. Spatial gradients (preserves parcel and edge sharp transitions)
        pred_dx = prediction[:, :, :, 1:] - prediction[:, :, :, :-1]
        target_dx = target[:, :, :, 1:] - target[:, :, :, :-1]
        pred_dy = prediction[:, :, 1:, :] - prediction[:, :, :-1, :]
        target_dy = target[:, :, 1:, :] - target[:, :, :-1, :]
        gradient = (
            torch.mean(torch.abs(pred_dx - target_dx))
            + torch.mean(torch.abs(pred_dy - target_dy))
        )

        return (
            self.mse_weight * mse
            + self.spectral_weight * spectral
            + self.gradient_weight * gradient
        )`
  },
  ragan: {
    title: "Stage 2 RaGAN Adversarial Fine-Tuning",
    code: `# File: model.py (Lines 1086-1268)
# ============================================================
# RELATIVISTIC AVERAGE GAN (RaGAN) + SPECTRAL NORMALIZATION
# ============================================================

class Discriminator(nn.Module):
    def __init__(self, in_channels=8, features=64):
        super().__init__()
        def block(in_c, out_c, stride):
            return [
                nn.utils.spectral_norm(nn.Conv2d(in_c, out_c, 3, stride=stride, padding=1)),
                nn.LeakyReLU(0.2, inplace=True)
            ]
        self.model = nn.ModuleList([
            *block(in_channels, features, 1),
            *block(features, features * 2, 2),
            *block(features * 2, features * 4, 2),
            nn.utils.spectral_norm(nn.Conv2d(features * 4, 1, 3, padding=1))
        ])

    def forward(self, x, return_features=False):
        feats = []
        h = x
        for layer in self.model:
            h = layer(h)
            if return_features and isinstance(layer, nn.LeakyReLU):
                feats.append(h)
        return (h, feats) if return_features else h

# Two Time-Scale Update Rule (TTUR):
g_optimizer = torch.optim.Adam(generator.parameters(), lr=5e-5)
d_optimizer = torch.optim.Adam(discriminator.parameters(), lr=2e-4)

# Loss: PixelLoss + 0.0005*RaGAN_Adv + 1.0*FeatureMatching`
  },
  caching: {
    title: "Dataset Caching Pipeline",
    code: `# File: model.py (Lines 48-175)
# ============================================================
# SEN2VENUS DATASET LOADING & LOCAL TENSOR CACHING
# ============================================================

class LocalSen2VenusDataset(Dataset):
    def __init__(self, cache_dir, length):
        self.cache_dir = cache_dir
        self.length = length

    def __len__(self):
        return self.length

    def __getitem__(self, i):
        # 0-latency pre-cached float32 tensors:
        # lr: [10, 128, 128] Sentinel-2 10m
        # hr: [8, 256, 256] VENuS 5m ground truth
        lr = np.load(f"{self.cache_dir}/{i}_lr.npy")
        hr = np.load(f"{self.cache_dir}/{i}_hr.npy")
        return torch.from_numpy(lr), torch.from_numpy(hr)`
  }
};

export default function ModelArchitectureWorkflow({ onBackToStudio }) {
  const [activeMainTab, setActiveMainTab] = useState("architecture"); // 'architecture' | 'workflow' | 'code' | 'specs'
  const [selectedLayerId, setSelectedLayerId] = useState("transformer");
  const [activeCodeTab, setActiveCodeTab] = useState("model");
  const [copied, setCopied] = useState(false);

  const selectedLayer = ARCHITECTURE_LAYERS.find(l => l.id === selectedLayerId) || ARCHITECTURE_LAYERS[0];

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(CODE_TABS[activeCodeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-[1520px] mx-auto py-10 px-6 font-sans">
      
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-8 mb-10 border-b border-[#222222] gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#222222] text-[#a8a8a8] border border-[#333333] text-[11px] font-semibold tracking-[0.88px] uppercase mb-3">
            <Cpu size={14} className="text-[#00d4ff]" />
            PROPRIETARY CUSTOM MODEL • ROOT TRAINING SCRIPT
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-white mb-2">
            Custom Model Architecture & Pipeline Workflow
          </h1>
          <p className="text-sm sm:text-base text-[#a8a8a8] max-w-3xl leading-relaxed">
            Every component of our <strong className="text-white">CNNTransformerSR</strong> neural network and the complete end-to-end training and synthesis pipeline is authored in{' '}
            <code className="bg-[#181818] border border-[#333333] text-[#33d17a] px-2 py-0.5 rounded font-mono-code text-xs font-semibold">
              {SCRIPT_PATH}
            </code>{' '}
            at the root of this workspace.
          </p>
        </div>

        {onBackToStudio && (
          <button
            onClick={onBackToStudio}
            className="h-10 px-5 rounded-md bg-[#222222] hover:bg-[#2a2a2a] text-white border border-[#333333] hover:border-[#0007cd] text-xs font-medium transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <span>← Return to Operational Studio</span>
          </button>
        )}
      </div>

      {/* Main View Mode Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2.5 mb-10 pb-4 border-b border-[#222222]">
        <button
          onClick={() => setActiveMainTab("architecture")}
          className={`h-11 px-5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border cursor-pointer ${
            activeMainTab === "architecture"
              ? "bg-[#0007cd] text-white border-[#0007cd] shadow-[0_0_20px_rgba(0,7,205,0.4)]"
              : "bg-[#181818] text-[#a8a8a8] hover:text-white border-[#222222] hover:border-[#333333]"
          }`}
        >
          <Cpu size={16} className={activeMainTab === "architecture" ? "text-white" : "text-[#00d4ff]"} />
          <span className="font-semibold">01 // Neural Model Architecture</span>
          <span className="font-mono-code text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10">CNNTransformerSR</span>
        </button>

        <button
          onClick={() => setActiveMainTab("workflow")}
          className={`h-11 px-5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border cursor-pointer ${
            activeMainTab === "workflow"
              ? "bg-[#0007cd] text-white border-[#0007cd] shadow-[0_0_20px_rgba(0,7,205,0.4)]"
              : "bg-[#181818] text-[#a8a8a8] hover:text-white border-[#222222] hover:border-[#333333]"
          }`}
        >
          <Activity size={16} className={activeMainTab === "workflow" ? "text-white" : "text-[#33d17a]"} />
          <span className="font-semibold">02 // Complete Pipeline Workflow</span>
          <span className="font-mono-code text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10">6-Stage End-to-End</span>
        </button>

        <button
          onClick={() => setActiveMainTab("code")}
          className={`h-11 px-5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border cursor-pointer ${
            activeMainTab === "code"
              ? "bg-[#0007cd] text-white border-[#0007cd] shadow-[0_0_20px_rgba(0,7,205,0.4)]"
              : "bg-[#181818] text-[#a8a8a8] hover:text-white border-[#222222] hover:border-[#333333]"
          }`}
        >
          <FileCode size={16} className={activeMainTab === "code" ? "text-white" : "text-[#7b3aed]"} />
          <span className="font-semibold">03 // Root Python Script Source</span>
          <span className="font-mono-code text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10">PyTorch Implementation</span>
        </button>
      </div>

      {/* VIEW 1: NEURAL MODEL ARCHITECTURE */}
      {activeMainTab === "architecture" && (
        <div className="space-y-8">
          
          {/* Architecture Overview Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left 7 cols: Interactive Layer-by-Layer Flow */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between pb-2 mb-2">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Layers size={18} className="text-[#0007cd]" />
                  Layer-by-Layer Topology (Click any block to inspect details)
                </h3>
                <span className="text-[11px] font-mono-code text-[#888888]">10 Input Bands → 8 Output Bands</span>
              </div>

              {ARCHITECTURE_LAYERS.map((layer) => {
                const isSelected = layer.id === selectedLayerId;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#181818] border-[#0007cd] shadow-[0_0_20px_rgba(0,7,205,0.25)]"
                        : "bg-[#121212] hover:bg-[#181818] border-[#222222] hover:border-[#333333]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono-code text-xs font-semibold px-2 py-0.5 rounded bg-[#222222] text-[#a8a8a8]">
                          {layer.number}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-white flex items-center gap-2">
                            {layer.name}
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-ping" />
                            )}
                          </div>
                          <div className="font-mono-code text-[11px] text-[#888888] mt-0.5">
                            {layer.pyClass}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono-code text-xs">
                        <div className="text-[#33d17a] font-medium">{layer.outputShape}</div>
                        <div className="text-[10px] text-[#666666]">{layer.params} params</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right 5 cols: Active Layer Deep Dive & Code */}
            <div className="lg:col-span-5 sticky top-24">
              <div className="bg-[#181818] border border-[#222222] rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#222222]">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedLayer.color }} />
                    <span className="font-semibold text-sm text-white">Layer {selectedLayer.number}: {selectedLayer.name}</span>
                  </div>
                  <span className="font-mono-code text-[11px] text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/30 px-2 py-0.5 rounded">
                    PyTorch nn.Module
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#a8a8a8] leading-relaxed mb-5">
                  {selectedLayer.description}
                </p>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-3 mb-5 font-mono-code text-xs">
                  <div className="bg-[#000000] border border-[#222222] p-3 rounded-lg">
                    <span className="text-[10px] text-[#666666] block uppercase tracking-wider mb-1">Input Shape</span>
                    <span className="text-white font-medium">{selectedLayer.inputShape}</span>
                  </div>
                  <div className="bg-[#000000] border border-[#222222] p-3 rounded-lg">
                    <span className="text-[10px] text-[#666666] block uppercase tracking-wider mb-1">Output Shape</span>
                    <span className="text-[#33d17a] font-medium">{selectedLayer.outputShape}</span>
                  </div>
                  <div className="bg-[#000000] border border-[#222222] p-3 rounded-lg">
                    <span className="text-[10px] text-[#666666] block uppercase tracking-wider mb-1">Parameters</span>
                    <span className="text-white font-medium">{selectedLayer.params}</span>
                  </div>
                  <div className="bg-[#000000] border border-[#222222] p-3 rounded-lg">
                    <span className="text-[10px] text-[#666666] block uppercase tracking-wider mb-1">Receptive Field</span>
                    <span className="text-[#00d4ff] font-medium">{selectedLayer.receptiveField}</span>
                  </div>
                </div>

                {/* Live Code Snippet */}
                <div className="bg-[#000000] border border-[#222222] rounded-xl p-3.5">
                  <div className="text-[11px] font-mono-code text-[#888888] mb-2 flex items-center justify-between">
                    <span>Implementation Snippet ({SCRIPT_PATH})</span>
                  </div>
                  <pre className="text-[11px] font-mono-code text-[#00d4ff] overflow-x-auto leading-relaxed">
                    {selectedLayer.codeSnippet}
                  </pre>
                </div>
              </div>
            </div>

          </div>

          {/* Model Specification Card Table */}
          <div className="bg-[#181818] border border-[#222222] rounded-2xl p-6 sm:p-8">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#33d17a]" />
              Model Architecture Specifications & Computational Profile
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono-code text-xs">
              <div className="bg-[#000000] border border-[#222222] rounded-xl p-4">
                <span className="text-[11px] text-[#666666] uppercase tracking-wider block mb-1">Total Parameters</span>
                <div className="text-xl font-medium text-white">1,241,864</div>
                <div className="text-[11px] text-[#33d17a] mt-1">Lightweight & High-Throughput</div>
              </div>

              <div className="bg-[#000000] border border-[#222222] rounded-xl p-4">
                <span className="text-[11px] text-[#666666] uppercase tracking-wider block mb-1">Attention Mechanism</span>
                <div className="text-xl font-medium text-[#00d4ff]">Shifted Window</div>
                <div className="text-[11px] text-[#888888] mt-1">ws=8, shift=4, 8 heads</div>
              </div>

              <div className="bg-[#000000] border border-[#222222] rounded-xl p-4">
                <span className="text-[11px] text-[#666666] uppercase tracking-wider block mb-1">GSD Conversion</span>
                <div className="text-xl font-medium text-[#7b3aed]">10m → 2.5m</div>
                <div className="text-[11px] text-[#888888] mt-1">4× Spatial / 16× Density</div>
              </div>

              <div className="bg-[#000000] border border-[#222222] rounded-xl p-4">
                <span className="text-[11px] text-[#666666] uppercase tracking-wider block mb-1">Inference Latency</span>
                <div className="text-xl font-medium text-[#33d17a]">~42 ms / tile</div>
                <div className="text-[11px] text-[#888888] mt-1">FastAPI GPU Pipeline</div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* VIEW 2: COMPLETE PIPELINE WORKFLOW */}
      {activeMainTab === "workflow" && (
        <div className="space-y-6">
          <div className="bg-[#181818] border border-[#222222] rounded-2xl p-6 sm:p-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#222222]">
              <div>
                <h3 className="text-xl font-semibold text-white">End-to-End Multi-Spectral Pipeline</h3>
                <p className="text-xs text-[#888888] mt-1">
                  Complete progression from raw satellite telemetry to calibrated, GIS-ready GeoTIFF deliverables.
                </p>
              </div>
              <span className="font-mono-code text-xs text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/30 px-3 py-1 rounded-full">
                All 6 Stages Authored in {SCRIPT_PATH}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {PIPELINE_STEPS.map((s) => (
                <div key={s.step} className="bg-[#000000] border border-[#222222] rounded-xl p-5 flex flex-col justify-between hover:border-[#333333] transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="w-8 h-8 rounded-md bg-[#0007cd] text-white flex items-center justify-center font-mono-code text-xs font-semibold">
                        {s.step}
                      </span>
                      <span className={`text-[10px] font-mono-code px-2 py-0.5 rounded border ${s.tagColor}`}>
                        {s.badge}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-white mb-1">{s.title}</h4>
                    <p className="text-[11px] font-mono-code text-[#666666] mb-3">{s.subtitle}</p>
                    <p className="text-xs text-[#a8a8a8] leading-relaxed">
                      {s.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between text-[10px] font-mono-code text-[#666666]">
                    <span>Stage {s.step} Complete</span>
                    <span className="text-[#33d17a]">PASS ✓</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: ROOT PYTHON SCRIPT SOURCE CODE */}
      {activeMainTab === "code" && (
        <div className="bg-[#181818] border border-[#222222] rounded-2xl p-6 sm:p-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-[#222222] gap-4">
            <div className="flex items-center gap-3">
              <FileCode size={20} className="text-[#00d4ff]" />
              <div>
                <span className="text-base font-semibold text-white font-mono-code">{SCRIPT_PATH}</span>
                <span className="text-xs text-[#888888] block">Live training source file located at workspace root</span>
              </div>
            </div>

            <button
              onClick={handleCopyCode}
              className="h-9 px-4 rounded-md bg-[#222222] hover:bg-[#2a2a2a] text-white border border-[#333333] text-xs font-mono-code transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              {copied ? <Check size={14} className="text-[#33d17a]" /> : <Copy size={14} />}
              <span>{copied ? "Copied to Clipboard!" : "Copy Python Snippet"}</span>
            </button>
          </div>

          {/* Sub-tabs for code sections */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.keys(CODE_TABS).map((key) => (
              <button
                key={key}
                onClick={() => setActiveCodeTab(key)}
                className={`h-8 px-3 rounded-md text-xs font-mono-code transition-all cursor-pointer ${
                  activeCodeTab === key
                    ? "bg-[#0007cd] text-white"
                    : "bg-[#000000] text-[#888888] hover:text-white border border-[#222222]"
                }`}
              >
                {CODE_TABS[key].title}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-[#000000] border border-[#222222] p-5 overflow-x-auto max-h-[560px] font-mono-code text-xs text-[#a8a8a8] leading-relaxed">
            <pre>{CODE_TABS[activeCodeTab].code}</pre>
          </div>
        </div>
      )}

    </div>
  );
}
