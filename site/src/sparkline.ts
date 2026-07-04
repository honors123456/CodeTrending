/** 内联 SVG sparkline（单序列微型折线，2px 线宽，带原生 title 提示） */
export function sparkSvg(values: (number | null)[], w = 110, h = 28): string {
  const pts: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null) pts.push({ i, v });
  });
  if (pts.length < 2) return `<span class="pending-data">—</span>`;

  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const pad = 3;
  const n = values.length - 1;
  const x = (i: number) => pad + (i / n) * (w - pad * 2);
  const y = (v: number) =>
    max === min ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2);

  const path = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${path}L${x(last.i).toFixed(1)},${h - 1}L${x(first.i).toFixed(1)},${h - 1}Z`;
  const title = `近14天 star：${min.toLocaleString()} → ${last.v.toLocaleString()}`;

  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title><path class="fill" d="${area}"/><path class="line" d="${path}"/></svg>`;
}
