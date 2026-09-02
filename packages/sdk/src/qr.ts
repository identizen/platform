import qrcode from 'qrcode-generator';

/** Inline SVG QR code for a deep link. Crisp, theme-neutral (white quiet zone, black modules). */
export function qrSvg(text: string, opts: { cell?: number; label?: string } = {}): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = opts.cell ?? 4;
  const size = n * cell;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c * cell} ${r * cell}h${cell}v${cell}h-${cell}z`;
    }
  }
  const label = opts.label ?? 'QR code: open on your phone to sign in';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
