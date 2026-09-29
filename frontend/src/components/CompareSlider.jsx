import React, { useState, useRef, useCallback } from 'react';

export default function CompareSlider({ beforeImage, afterImage, beforeLabel = "Input (10m)", afterLabel = "Super-Resolved (2.5m)" }) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const updatePos = useCallback((clientX) => {
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none rounded-xl overflow-hidden cursor-col-resize"
      style={{ height: '520px' }}
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
        alt="before"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      {/* After: right portion */}
      <img
        src={afterImage}
        alt="after"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      />

      {/* Divider */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-black text-xs font-bold">
          ⇔
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">{beforeLabel}</div>
      <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">{afterLabel}</div>
    </div>
  );
}
