import * as THREE from 'three'

type Place = { name: string; lng: number; lat: number }
export type SceneData = {
  box: { w: number; e: number; s: number; n: number }
  lo: number
  hi: number
  stops: Place[]
  legs: { meters: number; seconds: number; line: [number, number][] }[]
  lake: [number, number][]
}

/** Where something is on the stage, in CSS pixels. */
export type Spot = { x: number; y: number }
export type Frame = {
  /** Each stop, and whether the route has reached it. */
  stops: (Spot & { reached: boolean })[]
  /** The people following the route. */
  people: Spot[]
}

const gridSize = 384
const width = 20
const exaggeration = 4.2
const kmPerDegree = 110.57

/** Undoes the packing: 16-bit differences from the left neighbor, high bytes first. */
export async function unpackHeights(packed: ReadableStream<Uint8Array>) {
  const stream = packed.pipeThrough(
    new DecompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  const count = gridSize * gridSize
  const heights = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const before = i % gridSize ? heights[i - 1]! : i ? heights[i - gridSize]! : 0
    heights[i] = (before + bytes[i]! * 256 + bytes[count + i]!) & 65535
  }
  for (let i = 0; i < count; i++) heights[i] = heights[i]! / 65535
  return soften(heights)
}

/** Evens out the steps of the data, which would show as ragged contour lines on flat land. */
function soften(heights: Float32Array) {
  const out = new Float32Array(heights.length)
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      let sum = 0
      let weight = 0
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const [c, d] = [x + i, y + j]
          if (c < 0 || d < 0 || c >= gridSize || d >= gridSize) continue
          const k = 1 / (1 + i * i + j * j)
          sum += heights[d * gridSize + c]! * k
          weight += k
        }
      }
      out[y * gridSize + x] = sum / weight
    }
  }
  return out
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Everything fades into the page where the text is, so it can be read over the land.
const maskGlsl = /* glsl */ `
  uniform vec2 uRes;
  uniform vec4 uMask;
  float mask() {
    vec2 p = gl_FragCoord.xy / uRes;
    float side = smoothstep(uMask.x, uMask.y, p.x);
    float top = 1.0 - smoothstep(uMask.z, uMask.w, p.y);
    return side * top;
  }
`

const terrainVertex = /* glsl */ `
  uniform sampler2D uHeight;
  uniform float uScale;
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vHeight = texture2D(uHeight, vec2(uv.x, 1.0 - uv.y)).r;
    vec3 p = position;
    // The land goes down at its edges, so it never ends in a cliff.
    float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
    p.y += vHeight * uScale * (1.0 - smoothstep(0.82, 1.0, edge));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const terrainFragment = /* glsl */ `
  uniform sampler2D uHeight;
  uniform float uLo, uRange, uReveal, uScale;
  uniform vec3 uCamera, uLow, uHigh, uLine;
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorld;
  ${maskGlsl}
  float lines(float e, float every, float thick) {
    float v = e / every;
    float w = fwidth(v);
    float d = abs(fract(v - 0.5) - 0.5) / max(w, 1e-5);
    // Lines closer together than a few pixels would only be noise.
    return (1.0 - smoothstep(thick - 0.6, thick + 0.6, d)) * (1.0 - smoothstep(0.22, 0.5, w));
  }
  void main() {
    vec2 q = vec2(vUv.x, 1.0 - vUv.y);
    float s = 1.0 / ${gridSize}.0;
    float dx = texture2D(uHeight, q + vec2(s, 0.0)).r - texture2D(uHeight, q - vec2(s, 0.0)).r;
    float dy = texture2D(uHeight, q + vec2(0.0, s)).r - texture2D(uHeight, q - vec2(0.0, s)).r;
    vec3 normal = normalize(vec3(-dx * uScale * 9.0, 1.0, -dy * uScale * 9.0));
    float light = clamp(dot(normal, normalize(vec3(-0.55, 0.75, -0.45))), 0.0, 1.0);

    vec3 color = mix(uLow, uHigh, smoothstep(0.12, 0.95, vHeight));
    color *= mix(0.8, 1.04, light);

    float elevation = uLo + vHeight * uRange;
    float ink = max(lines(elevation, 10.0, 0.5) * 0.34, lines(elevation, 50.0, 0.85) * 0.8);
    // The lines climb the hills as the page opens.
    ink *= smoothstep(0.0, 0.1, uReveal * 1.12 - vHeight);
    color = mix(color, uLine, ink);

    float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    float far = smoothstep(13.0, 24.0, distance(vWorld, uCamera));
    float seen = (1.0 - smoothstep(0.8, 0.99, edge)) * (1.0 - far) * mask() * smoothstep(0.0, 0.35, uReveal);
    gl_FragColor = vec4(mix(vec3(1.0), color, seen), 1.0);
  }
`

const flatFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  ${maskGlsl}
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * mask());
  }
`

const routeVertex = /* glsl */ `
  uniform float uRadius;
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uRadius, 1.0);
  }
`
const routeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDraw;
  varying float vAlong;
  ${maskGlsl}
  void main() {
    if (vAlong > uDraw) discard;
    gl_FragColor = vec4(uColor, mask());
  }
`

// From low behind the hills, over them, along the route, close to the lake, and then from above.
const shots = [
  { at: 0, from: [-2.6, 3.0, 8.0], to: [4.6, 0.9, 4.2] },
  { at: 0.26, from: [1.4, 5.4, 9.2], to: [1.8, 0.6, 2.4] },
  { at: 0.5, from: [3.4, 5.6, 4.6], to: [0.4, 0.4, -0.8] },
  { at: 0.72, from: [1.2, 4.6, -0.2], to: [-1.0, 0.4, -4.1] },
  { at: 1, from: [0.2, 10.4, 2.6], to: [-0.4, 0.2, -1.6] },
] as const

export type ReliefScene = ReturnType<typeof createReliefScene>

export function createReliefScene(
  canvas: HTMLCanvasElement,
  data: SceneData,
  heights: Float32Array,
  onFrame: (frame: Frame) => void,
) {
  const { box } = data
  const middle = (box.n + box.s) / 2
  const depth =
    (width * (box.n - box.s) * kmPerDegree) /
    ((box.e - box.w) * kmPerDegree * Math.cos((middle * Math.PI) / 180))
  const metersAcross = (box.e - box.w) * kmPerDegree * 1000 * Math.cos((middle * Math.PI) / 180)
  const range = data.hi - data.lo
  const scale = (range * width * exaggeration) / metersAcross

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setClearColor(0xffffff, 1)
  THREE.ColorManagement.enabled = false

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80)

  const texture = new THREE.DataTexture(
    Uint16Array.from(heights, (h) => THREE.DataUtils.toHalfFloat(h)),
    gridSize,
    gridSize,
    THREE.RedFormat,
    THREE.HalfFloatType,
  )
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true

  const shared = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uMask: { value: new THREE.Vector4(0, 0.01, 1.1, 1.2) },
  }
  const terrain = new THREE.ShaderMaterial({
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: {
      ...shared,
      uHeight: { value: texture },
      uScale: { value: scale },
      uLo: { value: data.lo },
      uRange: { value: range },
      uReveal: { value: 0 },
      uCamera: { value: camera.position },
      uLow: { value: new THREE.Color('#f4f9f6') },
      uHigh: { value: new THREE.Color('#bfdccb') },
      uLine: { value: new THREE.Color('#4f8a6c') },
    },
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 260, 248), terrain)
  ground.geometry.rotateX(-Math.PI / 2)
  ground.frustumCulled = false
  scene.add(ground)

  function heightAt(lng: number, lat: number) {
    const x = clamp((lng - box.w) / (box.e - box.w)) * (gridSize - 1.001)
    const y = clamp((box.n - lat) / (box.n - box.s)) * (gridSize - 1.001)
    const [i, j] = [Math.floor(x), Math.floor(y)]
    const [a, b] = [x - i, y - j]
    const h = (c: number, r: number) => heights[r * gridSize + c]!
    return (
      (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) +
      (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b
    )
  }
  const toWorld = (lng: number, lat: number, above = 0) =>
    new THREE.Vector3(
      ((lng - box.w) / (box.e - box.w) - 0.5) * width,
      heightAt(lng, lat) * scale + above,
      ((box.n - lat) / (box.n - box.s) - 0.5) * depth,
    )

  if (data.lake.length > 3) {
    const points = data.lake.map(([lng, lat]) => toWorld(lng, lat))
    const level =
      Math.max(...points.map((p) => p.y)) * 0.5 + Math.min(...points.map((p) => p.y)) * 0.5
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)))
    const lake = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.ShaderMaterial({
        vertexShader:
          'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: flatFragment,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
        uniforms: {
          ...shared,
          uColor: { value: new THREE.Color('#a9d3e0') },
          uOpacity: { value: 0 },
        },
      }),
    )
    lake.rotation.x = -Math.PI / 2
    lake.position.y = level + 0.03
    lake.renderOrder = 1
    lake.name = 'lake'
    scene.add(lake)
  }

  const line = data.legs.flatMap((l, i) => (i ? l.line.slice(1) : l.line))
  const curve = new THREE.CatmullRomCurve3(
    line.map(([lng, lat]) => toWorld(lng, lat, 0.07)),
    false,
    'centripetal',
  )
  const route = new THREE.ShaderMaterial({
    vertexShader: routeVertex,
    fragmentShader: routeFragment,
    transparent: true,
    uniforms: {
      ...shared,
      uColor: { value: new THREE.Color('#1f5c3e') },
      uDraw: { value: 0 },
      uRadius: { value: 0.03 },
    },
  })
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 900, 0.0001, 7), route)
  tube.renderOrder = 2
  scene.add(tube)

  // How far along the drawn line each stop is.
  const samples = curve.getSpacedPoints(600)
  let from = 0
  const stops = data.stops.map(({ lng, lat }, index) => {
    const point = toWorld(lng, lat, 0.1)
    let best = from
    let least = Number.POSITIVE_INFINITY
    for (let i = from; i < samples.length; i++) {
      const p = samples[i]!
      const d = (p.x - point.x) ** 2 + (p.z - point.z) ** 2
      if (d < least) {
        least = d
        best = i
      }
    }
    if (index === data.stops.length - 1) best = samples.length - 1
    from = best
    return { point, along: best / (samples.length - 1) }
  })

  const positions = new THREE.CatmullRomCurve3(shots.map((s) => new THREE.Vector3(...s.from)))
  const targets = new THREE.CatmullRomCurve3(shots.map((s) => new THREE.Vector3(...s.to)))
  function along(progress: number) {
    const last = shots.length - 1
    for (let i = 0; i < last; i++) {
      const [a, b] = [shots[i]!.at, shots[i + 1]!.at]
      if (progress <= b)
        return (
          (i + smooth(0, 1, (progress - a) / (b - a)) * 0.35 + ((progress - a) / (b - a)) * 0.65) /
          last
        )
    }
    return 1
  }

  let w = 1
  let h = 1
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const look = new THREE.Vector3()
  const projected = new THREE.Vector3()

  function spot(point: THREE.Vector3): Spot {
    projected.copy(point).project(camera)
    return { x: (projected.x * 0.5 + 0.5) * w, y: (0.5 - projected.y * 0.5) * h }
  }

  return {
    resize(cssWidth: number, cssHeight: number) {
      w = cssWidth
      h = cssHeight
      const ratio = Math.min(devicePixelRatio, w < 768 ? 1.5 : 1.75)
      renderer.setPixelRatio(ratio)
      renderer.setSize(w, h, false)
      shared.uRes.value.set(w * ratio, h * ratio)
      camera.aspect = w / h
      const wide = w >= 900
      camera.fov = wide ? 38 : 50
      // Room for the text: beside the land on a wide screen, above it on a phone.
      if (wide) camera.setViewOffset(w, h, -w * 0.17, 0, w, h)
      else camera.setViewOffset(w, h, 0, -h * 0.2, w, h)
      shared.uMask.value.set(
        ...((wide ? [0.2, 0.5, 1.2, 1.3] : [-0.2, -0.1, 0.5, 0.68]) as [
          number,
          number,
          number,
          number,
        ]),
      )
      camera.updateProjectionMatrix()
    },

    point(x: number, y: number) {
      pointer.tx = x
      pointer.ty = y
    },

    /** Draws one frame; says whether something is still settling. */
    draw(progress: number, reveal: number) {
      pointer.x += (pointer.tx - pointer.x) * 0.06
      pointer.y += (pointer.ty - pointer.y) * 0.06
      const t = along(clamp(progress))
      positions.getPoint(t, camera.position)
      targets.getPoint(t, look)
      camera.position.x += pointer.x * 0.35
      camera.position.y += (1 - reveal) * 1.6 - pointer.y * 0.2
      camera.lookAt(look)
      camera.updateMatrixWorld()

      const drawn = smooth(0.3, 0.72, progress) * 1.0005
      terrain.uniforms.uReveal!.value = reveal
      route.uniforms.uDraw!.value = drawn
      // About as thick on the screen from near as from far.
      route.uniforms.uRadius!.value = camera.position.distanceTo(look) * (w < 768 ? 0.0046 : 0.0028)
      const lake = scene.getObjectByName('lake') as
        | THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
        | undefined
      if (lake) lake.material.uniforms.uOpacity!.value = smooth(0.5, 1, reveal)
      renderer.render(scene, camera)

      const ride = smooth(0.7, 0.97, progress)
      onFrame({
        stops: stops.map((s) => ({
          ...spot(s.point),
          reached: drawn >= s.along - 0.004 && drawn > 0.001,
        })),
        people: [0.16 + ride * 0.5, 0.92 - ride * 0.3].map((u) => spot(curve.getPointAt(clamp(u)))),
      })
      return Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.002
    },

    dispose() {
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      })
      texture.dispose()
      renderer.dispose()
    },
  }
}
