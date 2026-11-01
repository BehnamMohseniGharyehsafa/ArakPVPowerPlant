import { useEffect, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTwin } from '../state/store';
import { selectionPosition } from './geometry';
export default function FieldCamera({
  layout,
  onMotion,
}: {
  layout: any;
  onMotion?: (moving: boolean) => void;
}) {
  const ref = useRef<CameraControls>(null);
  const command = useTwin((s) => s.camera),
    selection = useTwin((s) => s.selection),
    run = useTwin((s) => s.run);
  const { invalidate, size } = useThree();
  useEffect(() => {
    if (!ref.current || !run) return;
    const controls = ref.current,
      span = layout.span;
    controls.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-span * 1.3, -2, -span * 1.3),
        new THREE.Vector3(span * 1.3, 100, span * 1.3),
      ),
    );
    let target = new THREE.Vector3(),
      offset = new THREE.Vector3(0.72, 0.66, 0.88);
    const distance = span * (size.width / size.height < 1.3 ? 2.05 : 1.6);
    offset.normalize().multiplyScalar(distance);
    if (command.mode === 'top')
      offset.set(0, span * (size.width / size.height < 1.3 ? 2.1 : 1.8), 0.01);
    if (command.mode === 'oblique') offset.set(span * 0.8, span * 0.28, span * 0.72);
    if (command.mode === 'focus' && selection) {
      const point = selectionPosition(run.metadata.scenario.plant, selection);
      target.set(point.x, point.y, point.z);
      const d = selection.type === 'module' ? 5.5 : selection.type === 'string' ? 30 : 55;
      offset.set(d * 0.45, d * 0.7, d * 0.85);
    }
    const pos = target.clone().add(offset);
    void controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
    invalidate();
  }, [command, run?.run_id, layout, size.width, size.height, invalidate]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea,button') || !ref.current)
        return;
      const c = ref.current;
      if (event.key === 'ArrowLeft') void c.truck(-5, 0, true);
      else if (event.key === 'ArrowRight') void c.truck(5, 0, true);
      else if (event.key === 'ArrowUp') void c.forward(5, true);
      else if (event.key === 'ArrowDown') void c.forward(-5, true);
      else if (event.key === '+' || event.key === '=') void c.dolly(c.distance * 0.15, true);
      else if (event.key === '-') void c.dolly(-c.distance * 0.15, true);
      else return;
      event.preventDefault();
      invalidate();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [invalidate]);
  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.38}
      draggingSmoothTime={0.16}
      dollySpeed={0.4}
      truckSpeed={1.1}
      minDistance={1.2}
      maxDistance={layout.span * 3.5}
      minPolarAngle={0.001}
      maxPolarAngle={Math.PI * 0.485}
      dollyToCursor
      boundaryFriction={0.35}
      onControlStart={() => onMotion?.(true)}
      onRest={() => onMotion?.(false)}
    />
  );
}
