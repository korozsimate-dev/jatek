// ============================================================
// Particle effects — tyre smoke, exhaust, sparks, nitro flames.
// One Points system per effect type, pooled and recycled.
// ============================================================
import * as THREE from 'three';

function softDot(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class ParticlePool {
  constructor(scene, count, opts = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.sizeArr = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.colorArr = new Float32Array(count * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colorArr, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizeArr, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    const tex = opts.texture || softDot();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uColor: { value: new THREE.Color(opts.color || '#ffffff') } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying float vAlpha; varying vec3 vColor;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          if (t.a * vAlpha < 0.004) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.renderOrder || 3;
    scene.add(this.points);
    this.gravity = opts.gravity ?? -1.2;
    this.drag = opts.drag ?? 1.4;
    this.grow = opts.grow ?? 1.6;
    this.baseColor = new THREE.Color(opts.color || '#ffffff');
    this.tint = opts.tint || null;
  }

  emit(x, y, z, vx, vy, vz, life = 1, size = 1, color = null) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.sizeArr[i] = size;
    this.alpha[i] = 1;
    const c = color || this.baseColor;
    this.colorArr[i * 3] = c.r; this.colorArr[i * 3 + 1] = c.g; this.colorArr[i * 3 + 2] = c.b;
    return i;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      any = true;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] += this.gravity * dt;
      const d = Math.exp(-this.drag * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t * t * 0.85;
      this.sizeArr[i] += this.grow * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    return any;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.parent?.remove(this.points);
  }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    const mul = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;
    this.smoke = new ParticlePool(scene, Math.round(340 * mul), {
      color: '#c8c8c8', gravity: 0.8, drag: 1.1, grow: 2.2, renderOrder: 4,
    });
    this.sparks = new ParticlePool(scene, Math.round(160 * mul), {
      color: '#ffce6a', additive: true, gravity: -9, drag: 0.6, grow: -0.6,
    });
    this.fire = new ParticlePool(scene, Math.round(140 * mul), {
      color: '#4aa8ff', additive: true, gravity: 0.6, drag: 1.6, grow: 1.2,
    });
    this.dust = new ParticlePool(scene, Math.round(120 * mul), {
      color: '#a8977a', gravity: -0.4, drag: 1.8, grow: 2.6,
    });
    this.skidMarks = new SkidMarks(scene, 900);
    this._acc = 0;
    this._fireAcc = 0;
  }

  // called every frame while driving
  updateVehicle(dt, vehicle, visual, wheelWorld) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.fire.update(dt);
    this.dust.update(dt);
    this.skidMarks.update(dt);

    if (!vehicle || !visual) return;
    const speed = Math.abs(vehicle.longSpeed);
    const slip = Math.abs(vehicle.slipAngle);
    const spin = vehicle.wheelspinAmount || 0;
    const smokeAmt = Math.max(0, (slip - 0.10) * 2.2) + spin * 0.75 + (vehicle.braking > 0.5 && speed > 14 ? 0.3 : 0);
    const wheelR = vehicle.def.body.wheelR;

    if (smokeAmt > 0.06 && speed > 3) {
      this._acc += dt * 90 * Math.min(1.6, smokeAmt);
      const rear = visual.wheels.filter((w) => !w.isFront);
      while (this._acc > 1) {
        this._acc -= 1;
        for (const w of rear) {
          const wp = new THREE.Vector3();
          w.grp.getWorldPosition(wp);
          const c = new THREE.Color('#d8d8d8').lerp(new THREE.Color('#8e8e8e'), Math.random());
          this.smoke.emit(
            wp.x + (Math.random() - 0.5) * 0.4, 0.18 + Math.random() * 0.2, wp.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 2.2 - vehicle.vx * 0.06,
            0.7 + Math.random() * 1.1,
            (Math.random() - 0.5) * 2.2 - vehicle.vz * 0.06,
            1.1 + Math.random() * 0.9, 0.5 + Math.random() * 0.5, c
          );
        }
      }
      // skid marks on tarmac
      if (speed > 6 && slip > 0.2) {
        for (const w of rear) {
          const wp = new THREE.Vector3();
          w.grp.getWorldPosition(wp);
          this.skidMarks.add(wp.x, wp.z, vehicle.heading, 0.32);
        }
      }
    }

    // exhaust / nitro
    if (vehicle.nitroActive) {
      this._fireAcc += dt * 130;
      const wp = new THREE.Vector3(-vehicle.def.body.length * 0.52, 0.28, 0);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.heading);
      wp.applyQuaternion(q).add(new THREE.Vector3(vehicle.x, 0, vehicle.z));
      while (this._fireAcc > 1) {
        this._fireAcc -= 1;
        const c = Math.random() < 0.5 ? new THREE.Color('#7fc4ff') : new THREE.Color('#38e8ff');
        this.fire.emit(
          wp.x + (Math.random() - 0.5) * 0.3, 0.25, wp.z + (Math.random() - 0.5) * 0.3,
          -Math.cos(vehicle.heading) * (4 + Math.random() * 5),
          0.3 + Math.random() * 1.2,
          Math.sin(vehicle.heading) * (4 + Math.random() * 5),
          0.35 + Math.random() * 0.25, 0.55, c
        );
      }
    }
    // backfire puff
    if (vehicle.events.backfire > 0.3 && Math.random() < 0.4) {
      const wp = new THREE.Vector3(-vehicle.def.body.length * 0.52, 0.3, 0);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.heading);
      wp.applyQuaternion(q).add(new THREE.Vector3(vehicle.x, 0, vehicle.z));
      const c = new THREE.Color(Math.random() < 0.5 ? '#ffb347' : '#7f6bff');
      this.fire.emit(wp.x, 0.3, wp.z, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0.3, 0.8, c);
    }
  }

  impact(x, y, z, strength = 1) {
    const n = Math.min(26, Math.round(9 + strength * 22));
    for (let i = 0; i < n; i++) {
      this.sparks.emit(
        x, y, z,
        (Math.random() - 0.5) * 12 * strength,
        2 + Math.random() * 6 * strength,
        (Math.random() - 0.5) * 12 * strength,
        0.3 + Math.random() * 0.45, 0.24 + Math.random() * 0.2,
        new THREE.Color(Math.random() < 0.5 ? '#ffd88a' : '#ff9a3c')
      );
    }
  }

  dustPuff(x, y, z, amount = 10) {
    for (let i = 0; i < amount; i++) {
      this.dust.emit(
        x + (Math.random() - 0.5), y + 0.2, z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3,
        0.9 + Math.random() * 0.8, 0.8 + Math.random() * 0.8,
        new THREE.Color(Math.random() < 0.5 ? '#a8977a' : '#8d7f66')
      );
    }
  }
}

// tyre marks: one big buffer of quads
class SkidMarks {
  constructor(scene, max = 800) {
    this.max = max;
    this.count = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    const idx = [];
    for (let i = 0; i < max; i++) {
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    geo.setIndex(idx);
    this.alpha = new Float32Array(max * 4).fill(0);
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; varying vec2 vUv;
        void main(){ vUv=uv; vA=alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; varying vec2 vUv;
        void main(){ float e = smoothstep(0.0,0.12,vUv.x)*smoothstep(1.0,0.88,vUv.x);
          if (vA < 0.01) discard; gl_FragColor = vec4(0.04,0.04,0.045, vA*e*0.72); }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this._lastEmit = 0;
  }

  add(x, z, heading, width) {
    const now = performance.now();
    if (now - this._lastEmit < 26) return;
    this._lastEmit = now;
    const i = this.count % this.max;
    this.count++;
    const b = i * 4;
    const nx = Math.sin(heading) * width * 0.5;
    const nz = Math.cos(heading) * width * 0.5;
    const fx = Math.cos(heading) * 0.55;
    const fz = -Math.sin(heading) * 0.55;
    // quad
    const pts = [
      [x - nx - fx, z - nz - fz], [x + nx - fx, z + nz - fz],
      [x - nx + fx, z - nz + fz], [x + nx + fx, z + nz + fz],
    ];
    for (let k = 0; k < 4; k++) {
      this.pos[(b + k) * 3] = pts[k][0];
      this.pos[(b + k) * 3 + 1] = 0.045;
      this.pos[(b + k) * 3 + 2] = pts[k][1];
      this.uv[(b + k) * 2] = (k % 2);
      this.uv[(b + k) * 2 + 1] = 0.5;
      this.alpha[b + k] = 1;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  update(dt) {}
}
