/**
 * The orb-weaver herself — a small silhouette that runs the spiral as it is
 * laid. Drawn pointing along +x so it can be rotated to the spiral's tangent.
 * (The spider/web theme is the site owner's own; this is its smallest form.)
 */
export default function Spider() {
  const legs = [-1, 1].flatMap((s) => [
    `M2 ${s * 2} Q6 ${s * 9} 13 ${s * 11}`,
    `M0 ${s * 2.5} Q2 ${s * 10} 5 ${s * 14}`,
    `M-2 ${s * 2.5} Q-4 ${s * 10} -8 ${s * 13}`,
    `M-3 ${s * 2} Q-8 ${s * 7} -14 ${s * 8}`,
  ]);
  return (
    <g className="spin-spider__body">
      {legs.map((d) => (
        <path key={d} d={d} />
      ))}
      <ellipse cx="-7" cy="0" rx="7.5" ry="6" />
      <circle cx="3.5" cy="0" r="3.8" />
    </g>
  );
}
