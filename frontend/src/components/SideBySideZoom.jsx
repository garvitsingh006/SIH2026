import React, { useState, useRef } from 'react';

const LENS = 160;
const ZOOM = 3;

export default function SideBySideZoom({
  beforeImage,
  afterImage,
  beforeLabel = "Input (10m)",
  afterLabel = "Super-Resolved (2.5m)",
}) {
  const [pos, setPos] = useState(null); // { rx, ry } relative 0-1 within each image
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  const handleMouseMove = (e, imgRef) => {
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
        style={{
          position: 'absolute',
          left: lensLeft,
          top: lensTop,
          width: LENS,
          height: LENS,
          borderRadius: '50%',
          border: '2px solid white',
          boxShadow: '0 0 12px rgba(0,0,0,0.7)',
          backgroundImage: `url(${src})`,
          backgroundSize: `${rect.width * ZOOM}px ${rect.height * ZOOM}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    );
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div
        className="relative cursor-crosshair"
        onMouseMove={(e) => handleMouseMove(e, beforeRef)}
        onMouseLeave={() => setPos(null)}
      >
        <img ref={beforeRef} src={beforeImage} alt="before" className="w-full rounded-lg border border-gray-700 object-contain" />
        <Lens src={beforeImage} imgRef={beforeRef} />
        <div className="text-center text-xs text-gray-400 mt-2">{beforeLabel}</div>
      </div>

      <div
        className="relative cursor-crosshair"
        onMouseMove={(e) => handleMouseMove(e, afterRef)}
        onMouseLeave={() => setPos(null)}
      >
        <img ref={afterRef} src={afterImage} alt="after" className="w-full rounded-lg border border-gray-700 object-contain" />
        <Lens src={afterImage} imgRef={afterRef} />
        <div className="text-center text-xs text-gray-400 mt-2">{afterLabel}</div>
      </div>
    </div>
  );
}
