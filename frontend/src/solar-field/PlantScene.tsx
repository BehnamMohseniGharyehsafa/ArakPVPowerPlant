import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../state/store';
import { topology, heatValue, heatRange } from './geometry';
import { panelTexture } from './textures';
import SiteEnvironment from './SiteEnvironment';
import FieldCamera from './FieldCamera';

export default function PlantScene({
  connections,
  context,
  quality,
  moving,
  onHover,
  onMotion,
}: {
  connections: boolean;
  context: boolean;
  quality: 'balanced' | 'high';
  moving: boolean;
  onHover: (index: number | null, x: number, y: number) => void;
  onMotion: (moving: boolean) => void;
}) {
  const run = useTwin((s) => s.run)!,
    equipment = useTwin((s) => s.equipment),
    hour = useTwin((s) => s.hour),
    columns = useTwin((s) => s.columns),
    selection = useTwin((s) => s.selection),
    mode = useTwin((s) => s.heatmap),
    set = useTwin((s) => s.set);
  const p = run.metadata.scenario.plant,
    layout = useMemo(() => topology(p), [p]);
  const front = useRef<THREE.InstancedMesh>(null),
    frames = useRef<THREE.InstancedMesh>(null),
    supports = useRef<THREE.InstancedMesh>(null),
    rails = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null),
    lastPointer = useRef(0);
  const naturalTexture = useMemo(() => panelTexture(true), []),
    dataTexture = useMemo(() => panelTexture(false), []);
  const { gl, camera, invalidate } = useThree();
  const row = useMemo(
    () => Object.fromEntries(Object.entries(columns ?? {}).map(([k, v]) => [k, v[hour]])),
    [columns, hour],
  );
  const wires = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < p.inverter_count * p.strings_per_inverter; i++) {
      const a = layout.positions[i * p.modules_per_string],
        b = layout.positions[(i + 1) * p.modules_per_string - 1],
        inv = layout.inverters[a.inv];
      positions.push(a.x, 0.35, a.z, b.x, 0.35, b.z, b.x, 0.35, b.z, inv.x, 0.35, inv.z);
    }
    return new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
  }, [layout, p]);
  useEffect(() => {
    const object = new THREE.Object3D(),
      normal = new THREE.Vector3(0, 1, 0).applyEuler(
        new THREE.Euler((p.tilt_deg * Math.PI) / 180, layout.angle, 0, 'YXZ'),
      );
    layout.positions.forEach((pos, i) => {
      object.position.set(pos.x, pos.y, pos.z);
      object.rotation.set(0, layout.angle, 0);
      object.rotateX((p.tilt_deg * Math.PI) / 180);
      object.scale.set(p.module.width_m, 0.065, p.module.length_m);
      object.updateMatrix();
      frames.current?.setMatrixAt(i, object.matrix);
      object.position.addScaledVector(normal, 0.044);
      object.scale.set(p.module.width_m - 0.035, 0.014, p.module.length_m - 0.035);
      object.updateMatrix();
      front.current?.setMatrixAt(i, object.matrix);
    });
    const slope = (p.tilt_deg * Math.PI) / 180,
      angle = layout.angle,
      half = p.module.length_m * 0.32;
    let supportIndex = 0,
      railIndex = 0;
    for (let string = 0; string < p.inverter_count * p.strings_per_inverter; string++) {
      const first = layout.positions[string * p.modules_per_string],
        last = layout.positions[(string + 1) * p.modules_per_string - 1];
      for (const side of [-1, 1]) {
        const dz = side * half * Math.cos(slope),
          dy = -side * half * Math.sin(slope);
        for (let i = 0; i < p.modules_per_string; i += 6) {
          const pos = layout.positions[string * p.modules_per_string + i],
            h = pos.y + dy - 0.06;
          object.position.set(pos.x + dz * Math.sin(angle), h / 2, pos.z + dz * Math.cos(angle));
          object.rotation.set(0, angle, 0);
          object.scale.set(0.085, h, 0.085);
          object.updateMatrix();
          supports.current?.setMatrixAt(supportIndex++, object.matrix);
        }
        object.position.set(
          (first.x + last.x) / 2 + dz * Math.sin(angle),
          first.y + dy - 0.04,
          (first.z + last.z) / 2 + dz * Math.cos(angle),
        );
        object.rotation.set(0, angle, 0);
        object.scale.set(p.modules_per_string * (p.module.width_m + 0.045), 0.085, 0.08);
        object.updateMatrix();
        rails.current?.setMatrixAt(railIndex++, object.matrix);
      }
    }
    for (const ref of [front, frames, supports, rails])
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
    if (supports.current) supports.current.count = supportIndex;
    if (rails.current) rails.current.count = railIndex;
    invalidate();
  }, [layout, p, invalidate]);
  useEffect(() => {
    const range = heatRange(mode, equipment?.strings, row, p),
      colour = new THREE.Color(),
      frameColour = new THREE.Color();
    const coral = new THREE.Color('#e8745d'),
      green = new THREE.Color('#42b99b');
    layout.positions.forEach((pos, i) => {
      const string = equipment?.strings[pos.string],
        value = heatValue(mode, string, row, p),
        fraction = THREE.MathUtils.clamp((value - range[0]) / (range[1] - range[0]), 0, 1);
      const selected =
        selection &&
        (selection.type === 'module'
          ? selection.index === i
          : selection.type === 'string'
            ? selection.index === pos.string
            : selection.index === pos.inv);
      if (mode === 'natural') colour.set('#ffffff');
      else if (mode === 'fault') colour.copy(green).lerp(coral, fraction);
      else if (mode === 'temperature') colour.setHSL(0.61 - fraction * 0.58, 0.74, 0.52);
      else colour.setHSL(0.61 - fraction * 0.16, 0.7, 0.32 + fraction * 0.29);
      frameColour.set(selected ? '#ffd45e' : string?.faults.length ? '#e57460' : '#bac5ca');
      front.current?.setColorAt(i, colour);
      frames.current?.setColorAt(i, frameColour);
    });
    if (front.current?.instanceColor) front.current.instanceColor.needsUpdate = true;
    if (frames.current?.instanceColor) frames.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [layout, equipment, row, selection, mode, p, invalidate]);
  useEffect(
    () => () => {
      naturalTexture.dispose();
      dataTexture.dispose();
      wires.dispose();
      document.body.style.cursor = '';
    },
    [naturalTexture, dataTexture, wires],
  );
  const pointer = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const now = performance.now();
    if (now - lastPointer.current < 45) return;
    lastPointer.current = now;
    const index = event.instanceId ?? null;
    setHover(index);
    const rect = gl.domElement.getBoundingClientRect();
    onHover(index, event.clientX - rect.left, event.clientY - rect.top);
    document.body.style.cursor = 'pointer';
  };
  const az = (Number(row.solar_azimuth_deg) * Math.PI) / 180,
    el = ((90 - Number(row.solar_zenith_deg)) * Math.PI) / 180,
    r = layout.span * 1.5;
  const sun: [number, number, number] = [
    Math.cos(el) * Math.sin(az) * r,
    Math.sin(el) * r,
    -Math.cos(el) * Math.cos(az) * r,
  ];
  const hovered = hover === null ? null : layout.positions[hover];
  return (
    <>
      <color attach="background" args={['#e7e3d9']} />
      <fog attach="fog" args={['#e7e3d9', layout.span * 2.5, layout.span * 6]} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#e7f0f7', '#b7b0a4', 1.65]} />
      <directionalLight
        position={sun}
        intensity={el > 0 ? 2.4 : 0}
        castShadow
        raycast={moving ? () => {} : THREE.InstancedMesh.prototype.raycast}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-layout.span * 0.8}
        shadow-camera-right={layout.span * 0.8}
        shadow-camera-top={layout.span * 0.8}
        shadow-camera-bottom={-layout.span * 0.8}
        shadow-camera-far={layout.span * 5}
        shadow-bias={-0.00015}
        shadow-normalBias={0.035}
      />
      <SiteEnvironment layout={layout} context={context} />
      <instancedMesh
        ref={supports}
        args={[
          undefined,
          undefined,
          2 * p.inverter_count * p.strings_per_inverter * Math.ceil(p.modules_per_string / 6),
        ]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#9da5a6" roughness={0.55} metalness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={rails}
        args={[undefined, undefined, 2 * p.inverter_count * p.strings_per_inverter]}
      >
        <boxGeometry />
        <meshStandardMaterial color="#b4bbba" roughness={0.45} metalness={0.65} />
      </instancedMesh>
      <instancedMesh ref={frames} args={[undefined, undefined, layout.positions.length]}>
        <boxGeometry />
        <meshStandardMaterial color="white" roughness={0.43} metalness={0.65} />
      </instancedMesh>
      <instancedMesh
        ref={front}
        castShadow
        args={[undefined, undefined, layout.positions.length]}
        onPointerMove={pointer}
        onPointerOut={() => {
          setHover(null);
          onHover(null, 0, 0);
          document.body.style.cursor = '';
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined)
            set({ selection: { type: 'module', index: event.instanceId } });
        }}
      >
        <boxGeometry />
        <meshStandardMaterial
          map={mode === 'natural' ? naturalTexture : dataTexture}
          color="white"
          roughness={0.32}
          metalness={0.13}
        />
      </instancedMesh>
      {hovered && (
        <mesh position={[hovered.x, hovered.y + 0.05, hovered.z]} rotation={[0, layout.angle, 0]}>
          <boxGeometry args={[p.module.width_m * 1.035, 0.06, p.module.length_m * 1.035]} />
          <meshBasicMaterial color="#f6cc61" wireframe depthTest={false} />
        </mesh>
      )}
      {layout.inverters.map((pos, i) => (
        <group key={i} position={[pos.x, pos.y, pos.z]} rotation={[0, layout.angle, 0]}>
          <mesh position={[0, -0.78, 0]} receiveShadow>
            <boxGeometry args={[4, 0.18, 2.8]} />
            <meshStandardMaterial color="#c5bca9" />
          </mesh>
          <mesh
            castShadow
            onClick={(event) => {
              event.stopPropagation();
              set({ selection: { type: 'inverter', index: i } });
            }}
          >
            <boxGeometry args={[2.4, 1.6, 1.05]} />
            <meshStandardMaterial
              color={
                equipment?.inverters[i]?.ac_power_kw === 0 && Number(row.ac_power_kw) > 0
                  ? '#dc8070'
                  : '#e6e5db'
              }
              roughness={0.5}
            />
          </mesh>
          <mesh position={[0, 0.1, 0.54]}>
            <boxGeometry args={[1.65, 0.68, 0.035]} />
            <meshStandardMaterial color="#344e54" />
          </mesh>
          <mesh position={[0.67, 0.12, 0.565]}>
            <boxGeometry args={[0.09, 0.09, 0.02]} />
            <meshBasicMaterial
              color={equipment?.inverters[i]?.ac_power_kw > 0 ? '#68cfa1' : '#c3a66f'}
            />
          </mesh>
        </group>
      ))}
      {connections && (
        <lineSegments geometry={wires}>
          <lineBasicMaterial color="#13b7d0" transparent opacity={0.7} />
        </lineSegments>
      )}
      <FieldCamera layout={layout} onMotion={onMotion} />
    </>
  );
}
