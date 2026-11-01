import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Original procedural scenery inspired by the supplied image. No satellite tiles or survey data.
export function seeded(seed = 47) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function soilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1536;
  const ctx = canvas.getContext('2d')!,
    random = seeded();
  ctx.fillStyle = '#c2b8a9';
  ctx.fillRect(0, 0, 1536, 1536);
  const tones = ['#afa89b', '#d4cbbd', '#9c9c92', '#dad2c4', '#b8b0a3'];
  for (let i = 0; i < 22000; i++) {
    const r = random() * 7 + 0.3;
    ctx.globalAlpha = random() * 0.32 + 0.08;
    ctx.fillStyle = tones[i % tones.length];
    ctx.beginPath();
    ctx.ellipse(random() * 1536, random() * 1536, r, r * 0.4, random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#918b78';
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    ctx.beginPath();
    const x = random() * 1536,
      y = random() * 1536;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 100, y - 30, x + 140, y + 90, x + 230, y + 120);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = 4;
  return texture;
}
function heightAt(x: number, z: number, width: number, depth: number) {
  const outside = Math.max(Math.abs(x) - width / 2 - 30, Math.abs(z) - depth / 2 - 30, 0);
  const blend =
    THREE.MathUtils.smoothstep(outside, 0, 90) *
    THREE.MathUtils.smoothstep(z, -depth * 0.3, depth * 0.5);
  const hill =
    44 * Math.exp(-((x + width * 0.95) ** 2 / 19000 + (z - depth * 0.7) ** 2 / 30000)) +
    28 * Math.exp(-((x - width * 0.95) ** 2 / 12000 + (z - depth * 0.98) ** 2 / 20000));
  const ridges =
    4 * Math.sin(x * 0.018 + z * 0.012) +
    2 * Math.cos(z * 0.038 - x * 0.009) +
    0.6 * Math.sin(x * 0.2) * Math.cos(z * 0.16);
  return -0.08 + blend * Math.max(-2, hill + ridges);
}
function Terrain({ layout, texture }: { layout: any; texture: THREE.CanvasTexture }) {
  const geometry = useMemo(() => {
    const size = layout.span * 5;
    const g = new THREE.PlaneGeometry(size, size, 128, 128);
    g.rotateX(-Math.PI / 2);
    const positions = g.attributes.position;
    const colours = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const bboxW =
      Math.abs(Math.cos(layout.angle)) * layout.width +
      Math.abs(Math.sin(layout.angle)) * layout.depth;
    const bboxD =
      Math.abs(Math.sin(layout.angle)) * layout.width +
      Math.abs(Math.cos(layout.angle)) * layout.depth;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      const h = heightAt(x, z, bboxW, bboxD);
      positions.setY(i, h);
      color.set(h > 12 ? '#a4a69e' : h > 5 ? '#c2bbb0' : '#e1dcd2');
      color.toArray(colours, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    g.computeVertexNormals();
    return g;
  }, [layout]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [texture, geometry],
  );
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        map={texture}
        bumpMap={texture}
        bumpScale={0.16}
        vertexColors
        roughness={1}
      />
    </mesh>
  );
}
function InstancedParts({
  parts,
  color,
}: {
  parts: { position: number[]; scale: number[]; rotation?: number[] }[];
  color: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const object = new THREE.Object3D();
    parts.forEach((part, i) => {
      object.position.fromArray(part.position);
      object.scale.fromArray(part.scale);
      object.rotation.set(...((part.rotation ?? [0, 0, 0]) as [number, number, number]));
      object.updateMatrix();
      ref.current?.setMatrixAt(i, object.matrix);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [parts]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]}>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={0.85} />
    </instancedMesh>
  );
}
function Orchard({ layout }: { layout: any }) {
  const crowns = useRef<THREE.InstancedMesh>(null),
    trunks = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const random = seeded(818),
      dummy = new THREE.Object3D();
    for (let i = 0; i < 96; i++) {
      const x = layout.width * 0.85 + (i % 12) * 8,
        z = -layout.depth * 0.75 - Math.floor(i / 12) * 9;
      dummy.position.set(x, 1.9, z);
      const size = 1.8 + random() * 0.9;
      dummy.scale.set(size, size * 0.65, size);
      dummy.updateMatrix();
      crowns.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.8;
      dummy.scale.set(0.22, 1.8, 0.22);
      dummy.updateMatrix();
      trunks.current?.setMatrixAt(i, dummy.matrix);
    }
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true;
      crowns.current.computeBoundingSphere();
    }
    if (trunks.current) {
      trunks.current.instanceMatrix.needsUpdate = true;
      trunks.current.computeBoundingSphere();
    }
  }, [layout]);
  return (
    <>
      <instancedMesh ref={crowns} args={[undefined, undefined, 96]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#6f7950" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, 96]}>
        <cylinderGeometry args={[0.18, 0.25, 1, 5]} />
        <meshStandardMaterial color="#8d7d5e" />
      </instancedMesh>
    </>
  );
}
export default function SiteEnvironment({
  layout,
  context = true,
}: {
  layout: any;
  context?: boolean;
}) {
  const texture = useMemo(soilTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const parts = useMemo(() => {
    const posts: any[] = [],
      buildings: any[] = [],
      roadLines: any[] = [];
    const w = layout.width / 2 + 10,
      d = layout.depth / 2 + 10;
    for (let x = -w; x <= w; x += 6)
      for (const z of [-d, d]) posts.push({ position: [x, 0.85, z], scale: [0.07, 1.8, 0.07] });
    for (let z = -d; z <= d; z += 6)
      for (const x of [-w, w]) posts.push({ position: [x, 0.85, z], scale: [0.07, 1.8, 0.07] });
    for (let i = 0; i < 8; i++)
      buildings.push({
        position: [w + 95 + (i % 4) * 19, 2, -d - 38 - Math.floor(i / 4) * 24],
        scale: [13, 4, 18],
      });
    for (let i = -16; i <= 16; i++)
      roadLines.push({ position: [i * 16, 0.08, -d - 68], scale: [7, 0.025, 0.22] });
    return { posts, buildings, roadLines, w, d };
  }, [layout]);
  const fence = useMemo(() => {
    const points: number[] = [];
    for (const y of [0.55, 1.25, 1.8]) {
      const { w, d } = parts;
      points.push(-w, y, -d, w, y, -d, w, y, -d, w, y, d, w, y, d, -w, y, d, -w, y, d, -w, y, -d);
    }
    return new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
  }, [parts]);
  return (
    <>
      <Terrain layout={layout} texture={texture} />
      <group rotation={[0, layout.angle, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]} receiveShadow>
          <planeGeometry args={[layout.width + 13, layout.depth + 14]} />
          <meshStandardMaterial
            color="#e1d7c6"
            map={texture}
            bumpMap={texture}
            bumpScale={0.06}
            roughness={1}
          />
        </mesh>
        <InstancedParts parts={parts.posts} color="#817b6d" />
        <lineSegments geometry={fence}>
          <lineBasicMaterial color="#8a8472" transparent opacity={0.45} />
        </lineSegments>
        {[-1, 1].map((side) => (
          <mesh key={'track' + side} position={[side * (layout.width / 2 + 6), 0.005, 0]}>
            <boxGeometry args={[3, 0.03, layout.depth + 18]} />
            <meshStandardMaterial color="#c1af90" roughness={1} />
          </mesh>
        ))}
        <mesh position={[0, 0.005, layout.depth / 2 + 5]}>
          <boxGeometry args={[layout.width + 15, 0.03, 3.8]} />
          <meshStandardMaterial color="#bcaa8b" />
        </mesh>
        <mesh position={[0, 0.015, -layout.depth / 2 - 4]}>
          <boxGeometry args={[layout.width + 18, 0.035, 4.5]} />
          <meshStandardMaterial color="#bca98c" />
        </mesh>
        <mesh position={[0, 0.015, -layout.depth / 2 - 28]}>
          <boxGeometry args={[5.5, 0.04, 46]} />
          <meshStandardMaterial color="#b2a18a" />
        </mesh>
        <mesh position={[layout.width / 2 - 17, 1.7, -layout.depth / 2 - 13]}>
          <boxGeometry args={[8, 3.4, 5]} />
          <meshStandardMaterial color="#e7dfcd" />
        </mesh>
        <mesh position={[layout.width / 2 - 17, 3.45, -layout.depth / 2 - 13]}>
          <boxGeometry args={[8.6, 0.2, 5.6]} />
          <meshStandardMaterial color="#b9aaa0" />
        </mesh>
        {context && (
          <>
            <mesh position={[0, 0.025, -parts.d - 68]}>
              <boxGeometry args={[layout.span * 4, 0.05, 15]} />
              <meshStandardMaterial color="#777b79" roughness={0.95} />
            </mesh>
            <InstancedParts parts={parts.roadLines} color="#e6dfc3" />
            <InstancedParts parts={parts.buildings} color="#dcd7ca" />
            <Orchard layout={layout} />
          </>
        )}
      </group>
    </>
  );
}
