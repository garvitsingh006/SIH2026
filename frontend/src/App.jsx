import React, { useState } from 'react';
import axios from 'axios';
import { 
  UploadCloud, Satellite, Layers, Download, Activity, 
  Sparkles, CheckCircle2, AlertCircle, FileCheck, ArrowRight 
} from 'lucide-react';
import SideBySideZoom from './components/SideBySideZoom';

const BACKEND_URL = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("rgb"); // 'rgb' | 'ndvi' | 'ndwi' | 'confidence'
  const [error, setError] = useState(null);

  const handleUpload = async (fileToUpload) => {
    const targetFile = fileToUpload || file;
    if (!targetFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", targetFile);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/super-resolve`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(response.data);
      setActiveTab("rgb");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Super-resolution failed. Make sure api.py is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to construct full media URL
  const getUrl = (path) => path ? `${BACKEND_URL}${path}` : null;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-gray-800 bg-[#111827]/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Satellite size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide flex items-center gap-2">
              SatelliteSR <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">SIH 2026 - PS 142</span>
            </h1>
            <p className="text-xs text-gray-400">Deep Learning Based Super-Resolution Mapping | Team Bable Bonkers</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Engine: SEN2SR 2.5m Lite
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-[1600px] w-full mx-auto">
        
        {/* Left Column: Controls & Ingestion (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Upload Card */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3 text-gray-200">
              <UploadCloud size={18} className="text-blue-400" />
              Ingest Satellite Tile
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Upload a 10-band Sentinel-2 tile as <code className="bg-gray-800 px-1 py-0.5 rounded">.npy</code> or georeferenced <code className="bg-gray-800 px-1 py-0.5 rounded">.tif</code>.
            </p>

            <div className="border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-xl p-6 text-center transition-colors cursor-pointer bg-gray-900/50">
              <input
                type="file"
                accept=".npy,.tif,.tiff"
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
                id="tile-upload"
              />
              <label htmlFor="tile-upload" className="cursor-pointer flex flex-col items-center">
                <Satellite className="text-gray-500 mb-2" size={32} />
                <span className="text-xs text-gray-300 font-medium">
                  {file ? file.name : "Click to select or drag & drop tile"}
                </span>
                <span className="text-[10px] text-gray-500 mt-1">Multi-spectral (10m L2A)</span>
              </label>
            </div>

            <button
              onClick={() => handleUpload()}
              disabled={!file || loading}
              className={`w-full mt-4 py-2.5 px-4 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all ${
                !file || loading
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating 2.5m Super-Resolution...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Run Super-Resolution Pipeline
                </>
              )}
            </button>
          </div>

          {/* Preset Demonstrations for Live Jury */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-2 text-gray-200">
              <Activity size={18} className="text-emerald-400" />
              Instant Jury Presets
            </h2>
            <p className="text-[11px] text-gray-400 mb-3">
              One-click showcase areas to present during the hackathon judging without waiting for uploads:
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => alert("Tip: Put pre-packaged demo npy files in public/presets/ to run with 1-click!")}
                className="p-2.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 text-left flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-gray-200">🌾 Punjab Farmlands</div>
                  <div className="text-[10px] text-gray-400">Micro-parcel boundary delineation & NDVI</div>
                </div>
                <ArrowRight size={14} className="text-gray-500" />
              </button>
              <button 
                onClick={() => alert("Tip: Put pre-packaged demo npy files in public/presets/ to run with 1-click!")}
                className="p-2.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 text-left flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-gray-200">🏙️ Delhi Urban Growth</div>
                  <div className="text-[10px] text-gray-400">Building density & road edge extraction</div>
                </div>
                <ArrowRight size={14} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* GIS Downloads (Active after job runs) */}
          {result && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 shadow-lg">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3 text-gray-200">
                <Download size={18} className="text-blue-400" />
                Export Analysis-Ready GeoTIFFs
              </h2>
              <div className="space-y-2">
                {Object.entries(result.geotiffs).map(([key, url]) => (
                  <a
                    key={key}
                    href={getUrl(url)}
                    download
                    className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/60 hover:bg-blue-600/20 hover:border-blue-500/50 border border-gray-700/50 text-xs transition-colors"
                  >
                    <span className="capitalize font-medium text-gray-300">{key.replace('_', ' ')} (.tif)</span>
                    <Download size={14} className="text-blue-400" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Visualization & Analytics (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Layer Selector Tabs */}
          <div className="flex items-center justify-between bg-[#111827] border border-gray-800 p-2 rounded-xl">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("rgb")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "rgb" ? "bg-blue-600 text-white shadow-md shadow-blue-600/30" : "text-gray-400 hover:text-white"
                }`}
              >
                True Color (RGB)
              </button>
              <button
                onClick={() => setActiveTab("ndvi")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "ndvi" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30" : "text-gray-400 hover:text-white"
                }`}
              >
                NDVI (Vegetation)
              </button>
              <button
                onClick={() => setActiveTab("ndwi")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "ndwi" ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30" : "text-gray-400 hover:text-white"
                }`}
              >
                NDWI (Water Bodies)
              </button>
              <button
                onClick={() => setActiveTab("confidence")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "confidence" ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "text-gray-400 hover:text-white"
                }`}
              >
                Confidence / Uncertainty
              </button>
            </div>

            {result && (
              <span className="text-[11px] text-gray-400 flex items-center gap-1.5 pr-2">
                <FileCheck size={14} className="text-emerald-400" />
                Job: <span className="font-mono text-gray-300">{result.job_id.slice(0, 8)}</span>
              </span>
            )}
          </div>

          {/* Main Visualizer Stage */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col justify-center items-center min-h-[560px]">
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-gray-200">Reconstructing Multi-Spectral Bands...</p>
                <p className="text-xs text-gray-400">Upscaling 10m bands to 2.5m with radiometric consistency</p>
              </div>
            ) : result ? (
              <div className="w-full">
                {activeTab === "rgb" && (
                  <SideBySideZoom
                    beforeImage={getUrl(result.previews.input_low_res_png)}
                    afterImage={getUrl(result.previews.enhanced_image_png)}
                  />
                )}
                {activeTab === "ndvi" && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={getUrl(result.previews.ndvi_png)} 
                      alt="NDVI" 
                      className="max-h-[500px] w-auto rounded-lg shadow-2xl border border-gray-800 object-contain"
                    />
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                      <span>Low (-1.0) Soil/Water</span>
                      <div className="w-36 h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-600" />
                      <span>Dense Vegetation (+1.0)</span>
                    </div>
                  </div>
                )}
                {activeTab === "ndwi" && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={getUrl(result.previews.ndwi_png)} 
                      alt="NDWI" 
                      className="max-h-[500px] w-auto rounded-lg shadow-2xl border border-gray-800 object-contain"
                    />
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                      <span>Low (-1.0) Land/Vegetation</span>
                      <div className="w-36 h-2 rounded-full bg-gradient-to-r from-slate-500 via-blue-300 to-blue-700" />
                      <span>Open Water (+1.0)</span>
                    </div>
                  </div>
                )}
                {activeTab === "confidence" && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={getUrl(result.previews.confidence_png)} 
                      alt="Confidence Map" 
                      className="max-h-[500px] w-auto rounded-lg shadow-2xl border border-gray-800 object-contain"
                    />
                    <p className="text-xs text-gray-400 mt-2">Flags model-inferred textures vs data-supported regions</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 flex flex-col items-center">
                <Layers size={48} className="mb-3 opacity-40" />
                <p className="text-sm font-medium text-gray-300">No Tile Processed Yet</p>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  Select a multi-band Sentinel-2 tile on the left panel or click a preset to start super-resolution.
                </p>
              </div>
            )}
          </div>

          {/* Quick Metrics & Science Card */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Spatial Enhancement</span>
              <div className="text-lg font-bold text-blue-400 mt-1">10m → 2.5m</div>
              <span className="text-[10px] text-gray-500">4× Spatial / 16× Pixel Density</span>
            </div>
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Spectral Bands</span>
              <div className="text-lg font-bold text-emerald-400 mt-1">10 Channels</div>
              <span className="text-[10px] text-gray-500">VNIR + SWIR Bands Preserved</span>
            </div>
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">GIS Export Ready</span>
              <div className="text-lg font-bold text-purple-400 mt-1">GeoTIFF 32-bit</div>
              <span className="text-[10px] text-gray-500">Full CRS & Affine Transform</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}