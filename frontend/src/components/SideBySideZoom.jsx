import React, { useState, useRef } from 'react';
import { ZoomIn, Crosshair } from 'lucide-react';

const LENS = 160;
const ZOOM = 3;

export default function SideBySideZoom({
  beforeImage,
  afterImage,
  beforeLabel = "Input (10m L2A Sentinel-2)",
  afterLabel = "Super-Resolved (2.5m Custom SR)",
}) {
  const [pos, setPos] = useState(null); // { rx, ry } relative 0-1 within each image
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  const handleMouseMove = (e, imgRef) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    setPos({ rx: Math.min(1, Math.max(0, rx)), ry: Math.min(1, Math.max(0, ry)) });
  };

  const Lens = ({ src, imgRef }) => {
    if (!pos || !imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const cx = pos.rx * rect.width;
    const cy = pos.ry * rect.height;
    const bgX = -(cx * ZOOM - LENS / 2);
    const bgY = -(cy * ZOOM - LENS / 2);
    const lensLeft = Math.min(Math.max(cx - LENS / 2, 0), rect.width - LENS);
    const lensTop = Math.min(Math.max(cy - LENS / 2, 0), rect.height - LENS);

    return (
      <div
        className="pointer-events-none absolute z-20 rounded-full border-2 border-white shadow-2xl transition-transform"
        style={{
          left: lensLeft,
          top: lensTop,
          width: LENS,
          height: LENS,
          boxShadow: '0 0 24px rgba(0, 7, 205, 0.45), 0 0 8px rgba(0, 212, 255, 0.3)',
          backgroundImage: `url(${src})`,
          backgroundSize: `${rect.width * ZOOM}px ${rect.height * ZOOM}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Subtle center reticle crosshair */}
        <div className="absolute inset-0 flex items-center justify-center opacity-40">
          <div className="w-4 h-[1px] bg-white"></div>
          <div className="h-4 w-[1px] bg-white absolute"></div>
        </div>
        <div className="absolute bottom-2 inset-x-0 text-center">
          <span className="font-mono-code text-[9px] font-semibold text-white bg-black/70 px-1.5 py-0.5 rounded border border-white/20">
            3.0×
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Before Pane */}
        <div className="bg-[#181818] border border-[#222222] rounded-xl p-3 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2 px-1">
            <span className="font-mono-code text-[11px] font-semibold tracking-wider uppercase text-[#a8a8a8] bg-[#222222] px-2 py-0.5 rounded-full border border-[#333333]">
              {beforeLabel}
            </span>
            <span className="text-[11px] font-mono-code text-[#666666]">GSD: 10.0m</span>
          </div>
          
          <div
            className="relative cursor-crosshair w-full aspect-square bg-[#000000] rounded-lg overflow-hidden flex items-center justify-center border border-[#1a1a1a]"
            onMouseMove={(e) => handleMouseMove(e, beforeRef)}
            onMouseLeave={() => setPos(null)}
          >
            <img
              ref={beforeRef}
              src={beforeImage}
              alt="Sentinel-2 Input (10m)"
              className="w-full h-full object-contain select-none"
            />
            <Lens src={beforeImage} imgRef={beforeRef} />
          </div>
        </div>

        {/* After Pane */}
        <div className="bg-[#181818] border border-[#222222] rounded-xl p-3 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2 px-1">
            <span className="font-mono-code text-[11px] font-semibold tracking-wider uppercase text-white bg-[#0007cd]/30 px-2 py-0.5 rounded-full border border-[#0007cd]/60">
              {afterLabel}
            </span>
            <span className="text-[11px] font-mono-code text-[#00d4ff]">GSD: 2.5m (4×)</span>
          </div>

          <div
            className="relative cursor-crosshair w-full aspect-square bg-[#000000] rounded-lg overflow-hidden flex items-center justify-center border border-[#1a1a1a]"
            onMouseMove={(e) => handleMouseMove(e, afterRef)}
            onMouseLeave={() => setPos(null)}
          >
            <img
              ref={afterRef}
              src={afterImage}
              alt="Enhanced Super-Resolution (2.5m)"
              className="w-full h-full object-contain select-none"
            />
            <Lens src={afterImage} imgRef={afterRef} />
          </div>
        </div>
      </div>

      {/* Synchronized Inspection Helper */}
      <div className="flex items-center justify-between text-xs text-[#888888] px-2 py-1 bg-[#181818]/60 border border-[#222222] rounded-lg">
        <div className="flex items-center gap-1.5">
          <Crosshair size={13} className="text-[#00d4ff]" />
          <span>Synchronized Dual-Lens: Hover either panel to inspect sub-pixel restoration.</span>
        </div>
        {pos && (
          <div className="font-mono-code text-[11px] text-[#a8a8a8]">
            X: {(pos.rx * 100).toFixed(1)}% | Y: {(pos.ry * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

