import * as THREE from 'three';
export function panelTexture(natural: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 704;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = natural ? '#132c43' : '#e1e8eb';
  ctx.fillRect(0, 0, 384, 704);
  const cols = 6,
    rows = 22,
    gap = 2,
    pad = 5,
    cw = (384 - pad * 2) / cols,
    ch = (704 - pad * 2) / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const left = pad + x * cw + gap / 2,
        top = pad + y * ch + gap / 2;
      const grad = ctx.createLinearGradient(left, top, left + cw, top + ch);
      grad.addColorStop(0, natural ? '#254765' : '#f1f5f6');
      grad.addColorStop(0.55, natural ? '#14364e' : '#dce4e8');
      grad.addColorStop(1, natural ? '#1e4059' : '#edf2f5');
      ctx.fillStyle = grad;
      ctx.fillRect(left, top, cw - gap, ch - gap);
      ctx.strokeStyle = natural ? '#9fb5c75c' : '#b0bec850';
      ctx.lineWidth = 0.65;
      for (let bus = 1; bus < 9; bus++) {
        const bx = left + ((cw - gap) * bus) / 9;
        ctx.beginPath();
        ctx.moveTo(bx, top + 1);
        ctx.lineTo(bx, top + ch - gap - 1);
        ctx.stroke();
      }
    }
  ctx.fillStyle = natural ? '#b9c4c9' : '#d4dfe5';
  ctx.fillRect(3, 350, 378, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
