// Optional realistic model for Алёна Владимировна.
// Drop a Mixamo character into office/models/ as alena.glb or alena.fbx (T-pose, with skin)
// and it replaces the built-in model. The seated pose is made by aiming bones at directions
// in her own frame, so it does not depend on the rig's local axis conventions.
import * as THREE from 'three';

const HEIGHT = 1.66;
const SEAT_HIPS_Y = 0.56;

async function exists(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; }
}

export async function loadModelBoss(urls) {
  for (const url of urls) {
    if (!(await exists(url))) continue;
    try {
      if (url.endsWith('.fbx')) {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        return await new FBXLoader().loadAsync(url);
      }
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      return (await new GLTFLoader().loadAsync(url)).scene;
    } catch (e) { console.warn('boss model failed to load', url, e); }
  }
  return null;
}

// directions in her frame: she faces -Z, her left is -X
const D = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const POSE = {
  thigh: D(0, -0.1, -1), shin: D(0, -1, -0.1), foot: D(0, -0.4, -1),
  spine: D(0, 1, -0.06),
  type: { upper: D(0.13, -0.85, -0.45), fore: D(-0.18, -0.12, -1), hand: D(-0.05, -0.2, -1) },
  phone: { upper: D(0.5, -0.45, -0.5), fore: D(-0.45, 0.88, 0.15), hand: D(-0.3, 0.9, 0.2) },
  wave: { upper: D(0.75, 0.45, -0.25), fore: D(0.05, 1, -0.2), hand: D(0, 1, -0.1) },
};

export function makeModelBoss(object, parent) {
  const g = new THREE.Group();
  parent.add(g);
  const wrap = new THREE.Group();          // Mixamo characters face +Z: turn her to face -Z
  wrap.rotation.y = Math.PI;
  g.add(wrap);
  wrap.add(object);
  object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  // normalise size: FBX from Mixamo is in centimetres
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const k = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
  object.scale.multiplyScalar(k);
  object.updateWorldMatrix(true, true);
  const box2 = new THREE.Box3().setFromObject(object);
  object.position.y -= box2.min.y;

  const bones = {};
  object.traverse((o) => { if (o.isBone) bones[o.name.replace(/^.*[:_]/, '').replace(/^mixamorig/, '')] = o; });
  const B = (n) => bones[n];
  const required = ['Hips', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'Head'];
  if (required.some((n) => !B(n))) { parent.remove(g); return null; }

  // sit: lower the whole body so the hips rest on the seat
  g.updateWorldMatrix(true, true);
  const hipsLocal = g.worldToLocal(B('Hips').getWorldPosition(new THREE.Vector3()));
  wrap.position.y = SEAT_HIPS_Y - hipsLocal.y;
  wrap.position.z = 0.04 - hipsLocal.z;

  const posed = ['Spine', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'Neck', 'Head'].filter(B);
  const rest = Object.fromEntries(posed.map((n) => [n, B(n).quaternion.clone()]));
  const child = (n) => ({ LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1', Spine: 'Neck' })[n];

  const gq = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), q = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cur = new THREE.Vector3(), tgt = new THREE.Vector3();
  // turn a bone so the direction to its child matches `dir` (given in her frame)
  const aimBone = (name, dir) => {
    const bone = B(name), c = B(child(name));
    if (!bone || !c) return;
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(a); c.getWorldPosition(b);
    cur.subVectors(b, a).normalize();
    tgt.copy(dir).applyQuaternion(gq).normalize();
    q.setFromUnitVectors(cur, tgt);
    bone.getWorldQuaternion(wq);
    bone.parent.getWorldQuaternion(pq);
    bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  };
  const turnAboutUp = (name, yaw, pitch) => {
    const bone = B(name);
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    bone.getWorldQuaternion(wq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(gq);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(gq);
    q.setFromAxisAngle(up, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(side, pitch));
    bone.parent.getWorldQuaternion(pq);
    bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  };
  const mix = (d1, d2, k2) => new THREE.Vector3().lerpVectors(d1, d2, k2).normalize();
  const mirror = (d) => new THREE.Vector3(-d.x, d.y, d.z);
  let lookYaw = 0, lookPitch = 0;

  const setPose = (t, phone = 0, wave = 0, typing = true) => {
    posed.forEach((n) => B(n).quaternion.copy(rest[n]));
    g.getWorldQuaternion(gq);
    if (B('Spine') && B('Neck')) aimBone('Spine', POSE.spine);
    ['Left', 'Right'].forEach((side) => {
      aimBone(`${side}UpLeg`, POSE.thigh);
      aimBone(`${side}Leg`, POSE.shin);
      aimBone(`${side}Foot`, POSE.foot);
    });
    const bob = typing ? Math.sin(t * 16) * 0.05 : 0;
    // her left arm (-X) holds the phone, the right one waves
    const L = { upper: mirror(POSE.type.upper), fore: mirror(POSE.type.fore), hand: mirror(POSE.type.hand) };
    const Rr = { upper: POSE.type.upper, fore: POSE.type.fore, hand: POSE.type.hand };
    const Lp = { upper: mirror(POSE.phone.upper), fore: mirror(POSE.phone.fore), hand: mirror(POSE.phone.hand) };
    const wv = { upper: POSE.wave.upper, fore: D(Math.sin(t * 9) * 0.3, 1, -0.2), hand: POSE.wave.hand };
    aimBone('LeftArm', mix(L.upper, Lp.upper, phone));
    aimBone('LeftForeArm', mix(D(L.fore.x, L.fore.y + bob, L.fore.z), Lp.fore, phone));
    aimBone('LeftHand', mix(L.hand, Lp.hand, phone));
    aimBone('RightArm', mix(Rr.upper, wv.upper, wave));
    aimBone('RightForeArm', mix(D(Rr.fore.x, Rr.fore.y - bob, Rr.fore.z), wv.fore, wave));
    aimBone('RightHand', mix(Rr.hand, wv.hand, wave));
    turnAboutUp('Neck', lookYaw * 0.4, lookPitch * 0.4);
    turnAboutUp('Head', lookYaw * 0.6, lookPitch * 0.6);
  };
  const setLook = (yaw, talking) => { lookYaw = yaw; lookPitch = talking ? 0.05 : -0.12; };
  const earOffset = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.3));
  const ear = (pos, quat) => {
    const h = B('Head');
    h.updateWorldMatrix(true, false);
    h.getWorldPosition(pos);
    g.getWorldQuaternion(quat);
    pos.add(new THREE.Vector3(-0.1, 0.03, 0).applyQuaternion(quat));
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lookYaw)).multiply(earOffset);
  };
  setPose(0);
  return { group: g, setPose, setLook, ear, look: 0, lookTarget: 0, phase: Math.random() * 10, model: true };
}
