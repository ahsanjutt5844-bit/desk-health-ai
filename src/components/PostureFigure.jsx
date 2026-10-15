import React from 'react';

// Side-view figure that mirrors the live measurements:
//   trunk lean  <- shoulder_angle      thoracic curve <- kyphosis
//   head angle  <- neck_angle          pelvis rotation <- pelvic_tilt
// The dashed outline is the calibrated upright posture.
const rad = (d) => (d * Math.PI) / 180;

function figure({ lean = 0, drop = 0, neck = 0, kyphosis = 0, pelvic = 0 }) {
  const hip = { x: 78, y: 176 };
  const trunk = 82;
  const sh = {
    x: hip.x + Math.sin(rad(lean)) * trunk,
    y: hip.y - Math.cos(rad(lean)) * trunk + drop * 2.2,
  };
  // thoracic hump bulges backward (away from the screen)
  const bulge = 4 + kyphosis * 16;
  const mid = { x: (hip.x + sh.x) / 2 - bulge, y: (hip.y + sh.y) / 2 };
  const neckLen = 22;
  const headAngle = lean + neck;
  const neckTop = { x: sh.x + Math.sin(rad(headAngle)) * neckLen, y: sh.y - Math.cos(rad(headAngle)) * neckLen };
  const head = { x: neckTop.x + Math.sin(rad(headAngle)) * 13, y: neckTop.y - Math.cos(rad(headAngle)) * 13 };
  return { hip, sh, mid, neckTop, head, pelvisRot: -pelvic * 22 };
}

function Body({ f, stroke, dashed, width = 7 }) {
  const dash = dashed ? '4 6' : undefined;
  return (
    <g stroke={stroke} fill="none" strokeLinecap="round" strokeWidth={width} strokeDasharray={dash} opacity={dashed ? 0.45 : 1}>
      <path d={`M ${f.hip.x} ${f.hip.y} Q ${f.mid.x} ${f.mid.y} ${f.sh.x} ${f.sh.y}`} />
      <line x1={f.sh.x} y1={f.sh.y} x2={f.neckTop.x} y2={f.neckTop.y} strokeWidth={width - 1} />
      <circle cx={f.head.x} cy={f.head.y} r={13} strokeWidth={dashed ? 2 : 3} fill={dashed ? 'none' : stroke} fillOpacity={0.15} />
      {/* arm to keyboard */}
      {!dashed && <path d={`M ${f.sh.x} ${f.sh.y + 4} L ${f.sh.x + 18} ${f.sh.y + 46} L ${f.sh.x + 52} ${f.sh.y + 50}`} strokeWidth={5} opacity={0.7} />}
      <ellipse cx={f.hip.x} cy={f.hip.y} rx={15} ry={9} strokeWidth={dashed ? 2 : 3}
        transform={`rotate(${f.pelvisRot} ${f.hip.x} ${f.hip.y})`} />
      {!dashed && <circle cx={f.sh.x} cy={f.sh.y} r={6.5} fill={stroke} stroke="none" />}
    </g>
  );
}

export default function PostureFigure({ posture, state }) {
  const p = posture || {};
  const live = figure({
    lean: Math.max(-25, Math.min(40, p.shoulder_angle || 0)),
    drop: Math.max(0, Math.min(10, p.shoulder_drop_cm || 0)),
    neck: Math.max(0, Math.min(45, (p.neck_angle || 0) - (p.shoulder_angle || 0) * 0.3)),
    kyphosis: p.kyphosis || 0,
    pelvic: p.pelvic_tilt || 0,
  });
  const ideal = figure({});
  const color = { Slouching: '#ff3d5e', Resting: '#ffb020', Healthy: '#12e2a3' }[state] || '#7d8a99';
  return (
    <svg viewBox="18 34 228 186" className="h-full w-full">
      {/* chair */}
      <g stroke="#223040" strokeWidth="6" strokeLinecap="round" fill="none">
        <line x1="40" y1="186" x2="110" y2="186" />
        <line x1="44" y1="186" x2="36" y2="96" />
        <line x1="76" y1="190" x2="76" y2="214" />
      </g>
      {/* desk + monitor */}
      <g stroke="#2e3d4e" strokeLinecap="round" fill="none">
        <line x1="150" y1="150" x2="236" y2="150" strokeWidth="5" />
        <line x1="222" y1="150" x2="222" y2="214" strokeWidth="5" />
        <rect x="210" y="78" width="10" height="56" rx="3" strokeWidth="4" fill="#111922" />
        <line x1="215" y1="134" x2="215" y2="150" strokeWidth="4" />
      </g>
      <Body f={ideal} stroke="#9aa6b4" dashed />
      <Body f={live} stroke={color} />
    </svg>
  );
}
