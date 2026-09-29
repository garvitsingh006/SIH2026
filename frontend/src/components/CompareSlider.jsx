import React, { useState, useRef, useCallback } from 'react';
import { SlidersHorizontal } from 'lucide-react';

export default function CompareSlider({
  beforeImage,
  afterImage,
  beforeLabel = "Input (10m L2A)",
  afterLabel = "Super-Resolved (2.5m)",
}) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const updatePos = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, []);

  return (
    <div className="space-y-3 w-full">
      <div
        ref={containerRef}
        className="relative w-full select-none rounded-xl overflow-hidden cursor-col-resize bg-[#000000] border border-[#222222]"
        style={{ minHeight: '480px', height: '520px' }}
        onMouseDown={(e) => { dragging.current = true; updatePos(e.clientX); }}
        onMouseMove={(e) => { if (dragging.current) updatePos(e.clientX); }}
        onMouseUp={() => { dragging.current = false; }}
        onMouseLeave={() => { dragging.current = false; }}
        onTouchStart={(e) => { dragging.current = true; updatePos(e.touches[0].clientX); }}
        onTouchMove={(e) => { if (dragging.current) updatePos(e.touches[0].clientX); }}
        onTouchEnd={() => { dragging.current = false; }}
      >
        {/* Before: left portion */}
        <img
          src={beforeImage}
          alt="Sentinel-2 Low Res"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />

        {/* After: right portion */}
        <img
          src={afterImage}
          alt="Super-Resolved High Res"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        />

        {/* Divider bar */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none shadow-[0_0_12px_rgba(0,7,205,0.8)]"
          style={{ left: `${pos}%` }}
        >
          {/* Composio styled handle */}
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#0007cd] hover:bg-[#0005a3] text-white rounded-md flex items-center justify-center border-2 border-white shadow-xl">
            <SlidersHorizontal size={14} />
          </div>
        </div>

        {/* Badge pills conforming to DESIGN.md */}
        <div className="absolute top-3 left-3 bg-[#181818]/90 backdrop-blur-md border border-[#333333] text-[#ffffff] font-mono-code text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full pointer-events-none">
          {beforeLabel}
        </div>
        <div className="absolute top-3 right-3 bg-[#0007cd]/90 backdrop-blur-md border border-white/20 text-[#ffffff] font-mono-code text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full pointer-events-none">
          {afterLabel}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#888888] px-2 py-1 bg-[#181818]/60 border border-[#222222] rounded-lg">
        <span>Drag center divider horizontally to evaluate edge reconstruction and feature crispness.</span>
        <span className="font-mono-code text-[11px] text-[#00d4ff]">Split: {pos.toFixed(0)}%</span>
      </div>
    </div>
  );
}

