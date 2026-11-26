import * as THREE from '../vendor/three.module.min.js';

// Skylantern Post — a dawn mail-run flight game over a 12-island archipelago.
// Thread 30 glowing rings, deliver lanterns to 6 island keepers, manage fuel
// and crosswind, unlock 4 upgrades between runs. Keyboard + mouse, offline.

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '7', 10);

// ---------- deterministic RNG ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rng = mulberry32(SEED);

// ---------- world data ----------
const ISLANDS = [
  {name:'Brine Isle', keeper:'Keeper Mara', x:-420, z:-260, r:150, h:46, req:'Three lanterns for the harbor festival, before the mist lifts.'},
  {name:'Gullrock', keeper:'Keeper Tomas', x:-90, z:-520, r:110, h:60, req:'The gulls stole my signal lamp again. One lantern, please.'},
  {name:'Ember Cay', keeper:'Keeper Ines', x:330, z:-430, r:130, h:52, req:'Forge night tonight — two lanterns to light the anvil yard.'},
  {name:'Lowtide', keeper:'Keeper Bram', x:560, z:-60, r:120, h:38, req:'Ferry dock is dark. A lantern for the mooring posts.'},
  {name:'Mistral Point', keeper:'Keeper Odile', x:240, z:300, r:140, h:66, req:'Wind took the chapel light. Bring one, mind the gusts.'},
  {name:'Home Strip', keeper:'Postmaster Rue', x:-260, z:380, r:170, h:34, req:'Bring the route home, pilot. The kettle is on.'},
];
const EXTRA_ISLES = [
  {x:-640,z:120,r:90,h:30},{x:-560,z:-560,r:100,h:44},{x:60,z:-160,r:70,h:26},
  {x:640,z:-420,r:95,h:40},{x:700,z:260,r:105,h:48},{x:-60,z:560,r:85,h:28},
];
const ALL_ISLES = [...ISLANDS, ...EXTRA_ISLES];

function terrainHeight(x,z){
  let h = -14;
  for(const s of ALL_ISLES){
    const d = Math.hypot(x-s.x, z-s.z);
    const t = Math.max(0, 1 - d/(s.r*1.9));
    h += s.h * t*t*(3-2*t);
  }
  h += Math.sin(x*0.012)*Math.cos(z*0.014)*3.2;
  return h;
}

// ring route: a plotted course weaving between the islands
const RINGS = [];
{
  const legs = [
    [-260,380],[-340,180],[-420,-60],[-420,-260],[-260,-420],[-90,-520],
    [110,-500],[330,-430],[470,-260],[560,-60],[430,140],[240,300],
    [40,420],[-260,380],
  ];
  for(let i=0;i<legs.length-1;i++){
    const [ax,az]=legs[i],[bx,bz]=legs[i+1];
    const n = 3;
    for(let k=1;k<=n;k++){
      const t=k/(n+1);
      const x=ax+(bx-ax)*t, z=az+(bz-az)*t;
      const y=Math.max(terrainHeight(x,z)+26, 34) + Math.sin(i*2.1+k)*7;
      RINGS.push({x,y,z,hit:false});
    }
  }
  while(RINGS.length>30) RINGS.pop();
}

// ---------- renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2b98a, 500, 2400);
const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.5, 6000);

const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
sun.position.set(-900, 420, -600);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-700; sun.shadow.camera.right=700;
sun.shadow.camera.top=700; sun.shadow.camera.bottom=-700;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a5a3a, 0.9));

// sky dome with dawn gradient
{
  const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false,
    uniforms:{},
    vertexShader:'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:`varying vec3 vP; void main(){ float h=normalize(vP).y;
      vec3 top=vec3(0.16,0.32,0.58); vec3 mid=vec3(0.98,0.62,0.42); vec3 low=vec3(1.0,0.82,0.55);
      vec3 c = h>0.25 ? mix(mid,top,smoothstep(0.25,0.75,h)) : mix(low,mid,smoothstep(-0.08,0.25,h));
      gl_FragColor=vec4(c,1.0); }`});
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(150,32), new THREE.MeshBasicMaterial({color:0xffe9b0, fog:false}));
  sunDisc.position.set(-2600, 620, -1900); sunDisc.lookAt(0,200,0); scene.add(sunDisc);
  // soft dawn glow around the sun
  const glowCanvas=document.createElement('canvas'); glowCanvas.width=glowCanvas.height=128;
  const gg=glowCanvas.getContext('2d');
  const grad=gg.createRadialGradient(64,64,2,64,64,64);
  grad.addColorStop(0,'rgba(255,233,176,0.9)'); grad.addColorStop(0.35,'rgba(255,201,106,0.35)'); grad.addColorStop(1,'rgba(255,201,106,0)');
  gg.fillStyle=grad; gg.fillRect(0,0,128,128);
  const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas), transparent:true, depthWrite:false, fog:false}));
  sunGlow.position.copy(sunDisc.position); sunGlow.scale.set(1500,1500,1); scene.add(sunGlow);
}

// terrain with vertex colors
{
  const size=2600, seg=110;
  const geo = new THREE.PlaneGeometry(size,size,seg,seg);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position;
  const colors = [];
  const cSand=new THREE.Color(0xe8cf9a), cGrass=new THREE.Color(0x5f9e57), cRock=new THREE.Color(0x8d7d6b), cDeep=new THREE.Color(0x3f6d4e), cSnow=new THREE.Color(0xf4f7f7), cMeadow=new THREE.Color(0x86b95e);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const h=terrainHeight(x,z);
    pos.setY(i,h);
    let c;
    if(h<2) c=cSand.clone();
    else if(h<16) c=cGrass.clone().lerp(cSand, 1-h/16);
    else if(h<34) c=cGrass.clone().lerp(cDeep,(h-16)/18);
    else if(h<52) c=cDeep.clone().lerp(cRock,(h-34)/18);
    else c=cRock.clone().lerp(cSnow, Math.min(1,(h-52)/16));
    // meadow mottling so slopes read as lived-in ground, not flat paint
    const n=Math.sin(x*0.11+z*0.07)*Math.sin(z*0.13-x*0.05);
    if(h>=2&&h<30) c.lerp(cMeadow, Math.max(0,n)*0.35);
    c.offsetHSL(0, 0, Math.sin(x*0.7)*Math.cos(z*0.6)*0.012);
    colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, metalness:0}));
  ground.receiveShadow = true;
  scene.add(ground);
}
// living water: travelling waves, fresnel sky sheen, sun glint, shore foam
const waterMat = new THREE.ShaderMaterial({
  transparent:true,
  uniforms:{
    uTime:{value:0},
    uSunDir:{value:new THREE.Vector3(-0.62,0.34,-0.42).normalize()},
    uIslands:{value: ALL_ISLES.map(s=>new THREE.Vector4(s.x,s.z,s.r,s.h))},
  },
  vertexShader:`
    uniform float uTime;
    varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
    float waveH(vec2 p){
      float h=0.0;
      h+=sin(p.x*0.018+uTime*0.9)*0.5;
      h+=sin(p.y*0.024-uTime*0.7)*0.4;
      h+=sin((p.x+p.y)*0.009+uTime*0.4)*0.7;
      h+=sin(length(p)*0.012-uTime*0.5)*0.25;
      return h;
    }
    void main(){
      vec3 pos=position;
      vec2 p=pos.xz;
      float h=waveH(p);
      float e=6.0;
      float hx=waveH(p+vec2(e,0.0))-h;
      float hz=waveH(p+vec2(0.0,e))-h;
      pos.y+=h;
      vNormal=normalize(vec3(-hx/e,1.0,-hz/e));
      vCrest=h;
      vec4 wp=modelMatrix*vec4(pos,1.0);
      vWorld=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    uniform float uTime; uniform vec3 uSunDir; uniform vec4 uIslands[12];
    varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec3 V=normalize(cameraPosition-vWorld);
      vec3 N=normalize(vNormal + vec3(sin(vWorld.x*0.35+uTime*1.4)*0.03,0.0,cos(vWorld.z*0.3-uTime*1.2)*0.03));
      float fres=pow(1.0-max(dot(N,V),0.0),2.2);
      vec3 deep=vec3(0.09,0.30,0.46);
      vec3 shallow=vec3(0.24,0.53,0.63);
      vec3 sky=vec3(0.98,0.66,0.44);
      vec3 col=mix(deep,shallow,clamp(vCrest*0.22+0.4,0.0,1.0));
      col=mix(col,sky,fres*0.5);
      vec3 H=normalize(V+uSunDir);
      float spec=pow(max(dot(N,H),0.0),180.0);
      float sparkle=step(0.992,hash(floor(vWorld.xz*1.6)+floor(uTime*2.0)))*0.5;
      col+=vec3(1.0,0.85,0.55)*(spec*0.75+sparkle*spec*1.0);
      float foam=0.0;
      for(int i=0;i<12;i++){
        vec4 isl=uIslands[i];
        float d=distance(vWorld.xz,isl.xy);
        float band=smoothstep(isl.z*1.95,isl.z*1.7,d)*smoothstep(isl.z*1.35,isl.z*1.6,d);
        foam+=band*(0.22+0.13*sin(d*0.3-uTime*1.4+hash(isl.xy)*6.0));
      }
      foam+=smoothstep(1.5,2.0,vCrest)*0.18;
      col=mix(col,vec3(0.98,0.97,0.92),clamp(foam,0.0,0.5));
      float dist=distance(cameraPosition,vWorld);
      float fogF=smoothstep(500.0,2400.0,dist);
      col=mix(col,vec3(0.95,0.73,0.54),fogF*0.75);
      gl_FragColor=vec4(col,0.94);
    }`,
});
const waterGeo=new THREE.PlaneGeometry(6000,6000,120,120); waterGeo.rotateX(-Math.PI/2);
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y=0; scene.add(water);

// trees, houses, lighthouse, runway dressing
function addTree(x,z){
  const h=terrainHeight(x,z); if(h<3) return;
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.7,4,5), new THREE.MeshStandardMaterial({color:0x6b4a2c}));
  trunk.position.y=2; g.add(trunk);
  if(rng()<0.45){ // round harbor-tree canopy
    const blob=new THREE.Mesh(new THREE.SphereGeometry(3.6,9,7), new THREE.MeshStandardMaterial({color:0x4d8a4a}));
    blob.position.y=7.4; blob.scale.y=0.85; blob.castShadow=true; g.add(blob);
    const blob2=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,6), new THREE.MeshStandardMaterial({color:0x5f9e57}));
    blob2.position.set(2,8.8,1); g.add(blob2);
  } else {
    const top=new THREE.Mesh(new THREE.ConeGeometry(3.4,9,7), new THREE.MeshStandardMaterial({color:0x2f6d3a}));
    top.position.y=8; top.castShadow=true; g.add(top);
  }
  const s=0.8+rng()*0.7; g.scale.set(s,s,s);
  g.position.set(x,h,z); scene.add(g);
}
for(let i=0;i<260;i++){ const s=ALL_ISLES[Math.floor(rng()*ALL_ISLES.length)];
  addTree(s.x+(rng()-0.5)*s.r*1.5, s.z+(rng()-0.5)*s.r*1.5); }

function addHouse(x,z,rot){
  const h=terrainHeight(x,z); if(h<3) return;
  const g=new THREE.Group();
  const wallColors=[0xf3e3c2,0xeed9b8,0xf6ead0,0xe8cfa8];
  const body=new THREE.Mesh(new THREE.BoxGeometry(9,6,7), new THREE.MeshStandardMaterial({color:wallColors[Math.floor(rng()*wallColors.length)]}));
  body.position.y=3; body.castShadow=true; g.add(body);
  const roofColors=[0xb5523c,0x9e4632,0xc2603f,0x8a5a3a];
  const roof=new THREE.Mesh(new THREE.ConeGeometry(7.4,4.4,4), new THREE.MeshStandardMaterial({color:roofColors[Math.floor(rng()*roofColors.length)]}));
  roof.position.y=8.2; roof.rotation.y=Math.PI/4; roof.castShadow=true; g.add(roof);
  const chimney=new THREE.Mesh(new THREE.BoxGeometry(1.3,2.6,1.3), new THREE.MeshStandardMaterial({color:0x8d7d6b}));
  chimney.position.set(2.4,9.2,0); g.add(chimney);
  const win=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2), new THREE.MeshBasicMaterial({color:0xffca6a}));
  win.position.set(0,3.2,3.55); g.add(win);
  const win2=win.clone(); win2.position.set(4.55,3.2,0); win2.rotation.y=Math.PI/2; g.add(win2);
  const door=new THREE.Mesh(new THREE.PlaneGeometry(1.8,3.4), new THREE.MeshStandardMaterial({color:0x6b4a2c}));
  door.position.set(-2.2,1.8,3.55); g.add(door);
  g.position.set(x,h,z); g.rotation.y=rot; scene.add(g);
}
for(const s of ISLANDS){ for(let i=0;i<6;i++){ const a=rng()*Math.PI*2, d=s.r*(0.3+rng()*0.45);
  addHouse(s.x+Math.cos(a)*d, s.z+Math.sin(a)*d, rng()*Math.PI); } }

// set dressing: shoreline rocks, a lighthouse, harbor docks and boats
{
  const rockMat=new THREE.MeshStandardMaterial({color:0x8d8578, roughness:1});
  for(let i=0;i<90;i++){
    const s=ALL_ISLES[Math.floor(rng()*ALL_ISLES.length)];
    const a=rng()*Math.PI*2, d=s.r*(1.15+rng()*0.55);
    const x=s.x+Math.cos(a)*d, z=s.z+Math.sin(a)*d;
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(2+rng()*4.5,0), rockMat);
    rock.position.set(x, Math.max(terrainHeight(x,z),-1)+0.8, z);
    rock.rotation.set(rng()*3,rng()*3,rng()*3); rock.castShadow=true; scene.add(rock);
  }
  // Gullrock lighthouse with a sweeping beam
  const gull=ISLANDS[1]; const gh=terrainHeight(gull.x+30,gull.z-24);
  const tower=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(3.2,4.4,30,10), new THREE.MeshStandardMaterial({color:0xf3e3c2}));
  shaft.position.y=15; shaft.castShadow=true; tower.add(shaft);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.9,6,10), new THREE.MeshStandardMaterial({color:0xd94f3d}));
  band.position.y=20; tower.add(band);
  const lampRoom=new THREE.Mesh(new THREE.CylinderGeometry(2.6,2.6,4,8), new THREE.MeshBasicMaterial({color:0xffca6a}));
  lampRoom.position.y=32; tower.add(lampRoom);
  const cap=new THREE.Mesh(new THREE.ConeGeometry(3.6,4,8), new THREE.MeshStandardMaterial({color:0x3c4148}));
  cap.position.y=36; tower.add(cap);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(6,80,10,1,true),
    new THREE.MeshBasicMaterial({color:0xffe9b0, transparent:true, opacity:0.06, side:THREE.DoubleSide, depthWrite:false}));
  beam.rotation.z=Math.PI/2.3; beam.position.set(38,32,0); tower.add(beam);
  tower.position.set(gull.x+30,gh,gull.z-24); scene.add(tower);
  // Brine Isle harbor: pier, crates, two lantern boats
  const brine=ISLANDS[0];
  const pier=new THREE.Mesh(new THREE.BoxGeometry(70,1.6,7), new THREE.MeshStandardMaterial({color:0x7a5a38}));
  pier.position.set(brine.x+120,2.2,brine.z+40); pier.rotation.y=0.5; scene.add(pier);
  for(let i=0;i<7;i++){
    const crate=new THREE.Mesh(new THREE.BoxGeometry(3.4,3.4,3.4), new THREE.MeshStandardMaterial({color:i%2?0xb5523c:0xc99b4a}));
    crate.position.set(brine.x+96+i*7,4.6,brine.z+34+i*2.4); crate.castShadow=true; scene.add(crate);
  }
  for(const [bx,bz,rot] of [[brine.x+150,brine.z+66,0.4],[brine.x+138,brine.z+18,-0.3]]){
    const boat=new THREE.Group();
    const hull=new THREE.Mesh(new THREE.BoxGeometry(16,3,5), new THREE.MeshStandardMaterial({color:0x8a4a32}));
    hull.castShadow=true; boat.add(hull);
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,11,5), new THREE.MeshStandardMaterial({color:0x5a3d24}));
    mast.position.y=6; boat.add(mast);
    const sail=new THREE.Mesh(new THREE.PlaneGeometry(7,8), new THREE.MeshStandardMaterial({color:0xf6ead0, side:THREE.DoubleSide}));
    sail.position.set(2,6.5,0); boat.add(sail);
    const bl=new THREE.Mesh(new THREE.SphereGeometry(0.8,8,8), new THREE.MeshBasicMaterial({color:0xffca6a}));
    bl.position.set(-7,3.4,0); boat.add(bl);
    boat.position.set(bx,1.4,bz); boat.rotation.y=rot; scene.add(boat);
  }
}

// runway at Home Strip + beacon pylons at each keeper island
const beacons = [];
{
  const home = ISLANDS[5];
  const rw = new THREE.Mesh(new THREE.BoxGeometry(16,0.6,190), new THREE.MeshStandardMaterial({color:0x3c4148}));
  rw.position.set(home.x+40, terrainHeight(home.x+40,home.z)+1.2, home.z); rw.receiveShadow=true; scene.add(rw);
  for(let i=0;i<9;i++){
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.9,8,8), new THREE.MeshBasicMaterial({color:0xffd98a}));
    lamp.position.set(home.x+31, terrainHeight(home.x+31,home.z-i*20+80)+2.4, home.z-i*20+80); scene.add(lamp);
    const lamp2=lamp.clone(); lamp2.position.x=home.x+49; scene.add(lamp2);
  }
}
for(const s of ISLANDS){
  const h=terrainHeight(s.x,s.z);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.2,26,6), new THREE.MeshStandardMaterial({color:0xe8e2d4}));
  pole.position.set(s.x,h+13,s.z); pole.castShadow=true; scene.add(pole);
  const orb=new THREE.Mesh(new THREE.SphereGeometry(2.6,12,12), new THREE.MeshBasicMaterial({color:0xffca6a}));
  orb.position.set(s.x,h+28,s.z); scene.add(orb);
  const light=new THREE.PointLight(0xffb95e, 900, 180); light.position.copy(orb.position); scene.add(light);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(5,70,12,1,true),
    new THREE.MeshBasicMaterial({color:0xffd98a, transparent:true, opacity:0.07, side:THREE.DoubleSide, depthWrite:false}));
  beam.position.set(s.x,h+60,s.z); beam.visible=false; scene.add(beam);
  beacons.push({island:s, orb, light, beam, lit:false});
}

// clouds
const clouds=[];
{
  const cm=new THREE.MeshStandardMaterial({color:0xfff6e8, emissive:0xffc9a0, emissiveIntensity:0.5, transparent:true, opacity:0.85, roughness:1});
  for(let i=0;i<26;i++){
    const g=new THREE.Group();
    const n=3+Math.floor(rng()*3);
    for(let k=0;k<n;k++){ const s=new THREE.Mesh(new THREE.SphereGeometry(14+rng()*20,10,8), cm);
      s.position.set(k*22-n*11, rng()*6, rng()*10-5); s.scale.y=0.45; g.add(s); }
    g.position.set((rng()-0.5)*2400, 150+rng()*120, (rng()-0.5)*2400);
    scene.add(g); clouds.push(g);
  }
}

// wind streaks: visible moving air over the archipelago
const windPts={geo:null,pts:null};
{
  const N=340; const arr=new Float32Array(N*3);
  for(let i=0;i<N;i++){ arr[i*3]=(rng()-0.5)*2200; arr[i*3+1]=24+rng()*130; arr[i*3+2]=(rng()-0.5)*2200; }
  windPts.geo=new THREE.BufferGeometry();
  windPts.geo.setAttribute('position', new THREE.BufferAttribute(arr,3));
  windPts.pts=new THREE.Points(windPts.geo, new THREE.PointsMaterial({color:0xfff3c4, size:2.6, transparent:true, opacity:0.55, depthWrite:false}));
  scene.add(windPts.pts);
}
function stepWind(dt){
  const a=windPts.geo.attributes.position;
  for(let i=0;i<a.count;i++){
    let x=a.getX(i)+(14+state.wind*26)*dt;
    let z=a.getZ(i)+Math.sin(i*1.7+state.time)*dt*3;
    if(x>1150) x=-1150; if(x<-1150) x=1150;
    a.setX(i,x); a.setZ(i,z);
  }
  a.needsUpdate=true;
}

// rings
const ringMeshes=[];
{
  const geo=new THREE.TorusGeometry(11,0.85,10,36);
  const glowGeo=new THREE.TorusGeometry(11,2.1,10,36);
  for(const r of RINGS){
    const g=new THREE.Group();
    const glow=new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({color:0xffc96a, transparent:true, opacity:0.22, depthWrite:false}));
    g.add(glow);
    const m=new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color:0xffd98a}));
    g.add(m);
    g.position.set(r.x,r.y,r.z); scene.add(g);
    ringMeshes.push({group:g, core:m, glow});
  }
}
function paintRings(){
  ringMeshes.forEach((rm,i)=>{
    const hit=RINGS[i].hit, next=i===state.ringIdx;
    rm.core.material.color.set(hit?0x9fe8b1:(next?0xfff3c4:0xffd98a));
    rm.glow.material.color.set(hit?0x9fe8b1:0xffc96a);
    rm.glow.material.opacity = hit?0.08:(next?0.34:0.18);
  });
}

// the post plane, built from primitives with a lit lantern
const plane = new THREE.Group();
{
  const bodyMat=new THREE.MeshStandardMaterial({color:0xd94f3d, roughness:0.5, metalness:0.15});
  const cream=new THREE.MeshStandardMaterial({color:0xf6ead0, roughness:0.6});
  const fus=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.1,11,10), bodyMat);
  fus.rotation.x=Math.PI/2; fus.castShadow=true; plane.add(fus);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(1.5,10,8), cream); nose.position.z=5.4; plane.add(nose);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(17,0.35,2.6), cream); wing.position.set(0,1.3,1.2); wing.castShadow=true; plane.add(wing);
  const wing2=new THREE.Mesh(new THREE.BoxGeometry(15,0.3,2.2), cream); wing2.position.set(0,-0.9,1.0); plane.add(wing2);
  for(const sx of [-6.5,6.5]){ const strut=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,2.4,4), bodyMat);
    strut.position.set(sx,0.2,1.1); plane.add(strut); }
  const tail=new THREE.Mesh(new THREE.BoxGeometry(5.4,0.3,1.8), cream); tail.position.set(0,0.6,-5.2); plane.add(tail);
  const fin=new THREE.Mesh(new THREE.BoxGeometry(0.3,2.6,1.8), bodyMat); fin.position.set(0,1.6,-5.2); plane.add(fin);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(1.15,10,8), new THREE.MeshStandardMaterial({color:0x9fd4ff, roughness:0.15, metalness:0.4}));
  canopy.position.set(0,1.5,-0.6); canopy.scale.set(0.9,0.7,1.5); plane.add(canopy);
  // painted stripes + mail badge so the little post plane reads as a character, not a kit
  for(const sx of [-6.8,6.8]){
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.42,2.7), bodyMat);
    stripe.position.set(sx,1.32,1.2); plane.add(stripe);
  }
  const tailStripe=new THREE.Mesh(new THREE.BoxGeometry(0.34,2.6,1.2), cream);
  tailStripe.position.set(0,1.6,-5.5); plane.add(tailStripe);
  const badge=new THREE.Mesh(new THREE.CircleGeometry(0.85,16), new THREE.MeshBasicMaterial({color:0xffd98a}));
  badge.position.set(1.52,0.2,-0.8); badge.rotation.y=Math.PI/2; plane.add(badge);
  const badge2=badge.clone(); badge2.position.x=-1.52; badge2.rotation.y=-Math.PI/2; plane.add(badge2);
  const prop=new THREE.Group();
  for(let i=0;i<3;i++){ const blade=new THREE.Mesh(new THREE.BoxGeometry(0.5,4.6,0.18), new THREE.MeshStandardMaterial({color:0x5a3d24}));
    blade.rotation.z=i*Math.PI*2/3; prop.add(blade); }
  prop.position.z=6.6; plane.add(prop); plane.userData.prop=prop;
  const spinner=new THREE.Mesh(new THREE.ConeGeometry(0.62,1.6,10), cream);
  spinner.rotation.x=Math.PI/2; spinner.position.z=7.1; plane.add(spinner);
  const propDisc=new THREE.Mesh(new THREE.CircleGeometry(2.45,24),
    new THREE.MeshBasicMaterial({color:0xfff3c4, transparent:true, opacity:0.13, side:THREE.DoubleSide, depthWrite:false}));
  propDisc.position.z=6.55; plane.add(propDisc);
  for(const sx of [-8.3,8.3]){ const tip=new THREE.Mesh(new THREE.SphereGeometry(1.05,8,6), cream);
    tip.scale.set(1,0.22,1.3); tip.position.set(sx,1.3,1.2); plane.add(tip); }
  for(const sx of [-2.6,2.6]){
    const strut=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,2.2,4), bodyMat);
    strut.position.set(sx,-1.2,2.4); plane.add(strut);
  }
  const rack=new THREE.Mesh(new THREE.BoxGeometry(4.6,0.22,1.4), new THREE.MeshStandardMaterial({color:0x8a5a2a}));
  rack.position.set(0,-2.1,0.6); plane.add(rack);
  for(const lx of [-1.7,0,1.7]){
    const mini=new THREE.Mesh(new THREE.SphereGeometry(0.42,8,8), new THREE.MeshBasicMaterial({color:0xffca6a}));
    mini.position.set(lx,-2.45,0.6); plane.add(mini);
  }
  const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,1.6,5), new THREE.MeshStandardMaterial({color:0x3c4148}));
  exhaust.rotation.x=Math.PI/2.4; exhaust.position.set(1.2,-0.9,4.6); plane.add(exhaust);
  const lantern=new THREE.Mesh(new THREE.SphereGeometry(0.85,10,10), new THREE.MeshBasicMaterial({color:0xffca6a}));
  lantern.position.set(0,-1.7,0.6); plane.add(lantern);
  const glow=new THREE.PointLight(0xffb95e, 260, 90); glow.position.copy(lantern.position); plane.add(glow);
  for(const sx of [-2.6,2.6]){ const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.75,0.3,6,10), new THREE.MeshStandardMaterial({color:0x2c2c2c}));
    wheel.position.set(sx,-1.9,2.4); plane.add(wheel); }
  scene.add(plane);
}

// ---------- game state ----------
const UPGRADES = [
  {id:'engine', name:'Brass Engine', desc:'+25% cruise speed', icon:'⚙️'},
  {id:'tank', name:'Long Tank', desc:'+40% fuel', icon:'⛽'},
  {id:'rack', name:'Lantern Rack', desc:'carry 5 lanterns', icon:'🏮'},
  {id:'sails', name:'Calm Sails', desc:'halves crosswind push', icon:'⛵'},
];
const state = {
  mode:'title', // title | brief | fly | pause | done
  pos:new THREE.Vector3(-260, 60, 430),
  vel:new THREE.Vector3(0,0,-1),
  pitch:0, roll:0, heading:Math.PI, speed:42,
  fuel:100, lanterns:3, score:0, time:0,
  ringIdx:0, deliveries:0, wind:0, windT:0,
  upgrades:new Set(), runs:0, best:0, cam:'chase', sfx:true,
  dropped:[],
};
const keys={};
let mouseX=0, mouseY=0, mouseSeen=false;
addEventListener('keydown',e=>{ keys[e.code]=true;
  if(e.code==='Enter'){
    if(state.mode==='title'||state.mode==='done') showScreen('brief');
    else if(state.mode==='brief') startRun();
    else if(state.mode==='pause') resumeFlight();
  }
  if(e.code==='KeyR' && (state.mode==='fly'||state.mode==='pause')) startRun();
  if(e.code==='Space' && state.mode==='fly'){ dropLantern(); e.preventDefault(); }
  if(e.code==='KeyM' && (state.mode==='fly'||state.mode==='pause')) toggleRoute();
  if(e.code==='KeyC' && state.mode==='fly') cycleCam();
  if((e.code==='Escape'||e.code==='KeyP')){
    if(routeOpen) toggleRoute();
    else if(state.mode==='fly') pauseFlight();
    else if(state.mode==='pause') resumeFlight();
    else if(state.mode!=='title') showScreen('title');
  }
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('mousemove',e=>{ mouseX=(e.clientX/innerWidth-0.5)*2; mouseY=(e.clientY/innerHeight-0.5)*2; mouseSeen=true; });
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// ---------- audio (synth, no assets) ----------
let AC=null;
function beep(freq,dur,type='sine',gain=0.12){
  if(!state.sfx) return;
  try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(), g=AC.createGain();
    o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(gain,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+dur);
  }catch(e){}
}

// ---------- HUD ----------
const $=id=>document.getElementById(id);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(toast._h); toast._h=setTimeout(()=>t.style.display='none',2600); }
const LANTERN_SVG = on => `<svg viewBox="0 0 54 66" class="${on?'':'off'}"><ellipse cx="27" cy="34" rx="19" ry="24" fill="#ffca6a"/><path d="M27 10v48M14 16c6 10 6 26 0 36M40 16c-6 10-6 26 0 36" stroke="#b8742a" stroke-width="2" fill="none"/><rect x="21" y="4" width="12" height="6" rx="2" fill="#8a5a2a"/><rect x="21" y="56" width="12" height="6" rx="2" fill="#8a5a2a"/></svg>`;
function buildPips(){
  $('ringpips').innerHTML = RINGS.map(()=>'<i></i>').join('');
  $('brief-keepers').innerHTML = ISLANDS.map(s=>`<span class="chip">🏮 ${s.keeper} · ${s.name}</span>`).join('');
}
function popup(text){
  const d=document.createElement('div'); d.className='popup'; d.textContent=text;
  $('popups').appendChild(d); setTimeout(()=>d.remove(),1700);
}
function goalsHTML(){
  const goals=[
    {label:`Thread the rings (${Math.min(state.ringIdx,30)}/30)`, done:state.ringIdx>=30},
    {label:`Deliver to keepers (${state.deliveries}/6)`, done:state.deliveries>=6},
    {label:'Land home at Home Strip', done:false},
  ];
  $('goals').innerHTML = goals.map(g=>`<li class="${g.done?'done':''}"><span class="tick">${g.done?'✓':''}</span>${g.label}</li>`).join('');
  [...$('ringpips').children].forEach((el,i)=>{
    el.className = RINGS[i].hit ? 'hit' : (i===state.ringIdx ? 'next' : '');
  });
  $('delivpips').innerHTML = beacons.map(b=>LANTERN_SVG(b.lit)).join('');
  $('lantern-pips').innerHTML = Array.from({length:6},(_,i)=>LANTERN_SVG(i<state.lanterns)).join('');
}
function drawCompass(){
  const c=$('compass').getContext('2d'); const W=360,H=30;
  c.clearRect(0,0,W,H);
  const hd=((state.heading*180/Math.PI)%360+360)%360;
  c.font='bold 11px Trebuchet MS, sans-serif'; c.textAlign='center';
  const names={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'};
  for(let d=-70;d<=70;d+=5){
    let deg=Math.round((hd+d)/5)*5; const off=deg-hd;
    const x=W/2+off*2.4; if(x<4||x>W-4) continue;
    const norm=((deg%360)+360)%360;
    c.strokeStyle='rgba(255,217,138,.8)'; c.beginPath();
    c.moveTo(x,H-6); c.lineTo(x,H-(norm%45===0?16:10)); c.stroke();
    if(names[norm]){ c.fillStyle=norm===0?'#ff9d5c':'#ffeec4'; c.fillText(names[norm],x,12); }
  }
  c.fillStyle='#fff'; c.beginPath(); c.moveTo(W/2-5,2); c.lineTo(W/2+5,2); c.lineTo(W/2,9); c.closePath(); c.fill();
}
function drawTape(id,value,step,labelEvery,unit){
  const cv=$(id); const c=cv.getContext('2d'); const W=cv.width,H=cv.height,CY=H/2;
  c.clearRect(0,0,W,H);
  c.font='bold 10px Trebuchet MS, sans-serif';
  const pxPer=2.6;
  const base=Math.floor(value/step)*step;
  for(let v=base-step*9; v<=base+step*9; v+=step){
    if(v<0) continue;
    const y=CY-(v-value)*pxPer; if(y<6||y>H-6) continue;
    c.strokeStyle='rgba(255,217,138,.75)'; c.beginPath(); c.moveTo(W-14,y); c.lineTo(W-4,y); c.stroke();
    if(v%labelEvery===0){ c.fillStyle='#ffeec4'; c.textAlign='right'; c.fillText(String(v),W-18,y+3); }
  }
  c.fillStyle='#0d2b22'; c.strokeStyle='#9fe8b1'; c.lineWidth=1.6;
  c.fillRect(4,CY-13,W-8,26); c.strokeRect(4,CY-13,W-8,26);
  c.fillStyle='#fff'; c.font='bold 15px Trebuchet MS, sans-serif'; c.textAlign='center';
  c.fillText(String(Math.round(value)),W/2,CY+5);
}
function drawTapes(){
  drawTape('tapel', state.speed*2.1, 10, 20);
  drawTape('taper', Math.max(0,state.pos.y), 10, 20);
}
function cycleCam(){
  state.cam = state.cam==='chase' ? 'cockpit' : state.cam==='cockpit' ? 'cine' : 'chase';
  $('chip-cam').textContent='CAM: '+state.cam.toUpperCase();
  toast('Camera: '+state.cam);
}
$('chip-cam').addEventListener('click',()=>{ if(state.mode==='fly') cycleCam(); });
$('chip-sfx').addEventListener('click',()=>{ state.sfx=!state.sfx; $('chip-sfx').textContent='SFX: '+(state.sfx?'ON':'OFF'); });
$('chip-pause').addEventListener('click',()=>{ if(state.mode==='fly') pauseFlight(); else if(state.mode==='pause') resumeFlight(); });
function updateObjective(){
  const next=RINGS[state.ringIdx];
  const arrow=$('objarrow');
  if(!next){ arrow.style.transform='rotate(-90deg)'; $('objdist').textContent='ROUTE CLEAR — HEAD HOME'; return; }
  const bearing=Math.atan2(next.x-state.pos.x, -(next.z-state.pos.z));
  let diff=bearing-state.heading;
  while(diff>Math.PI) diff-=Math.PI*2; while(diff<-Math.PI) diff+=Math.PI*2;
  arrow.style.transform=`rotate(${diff*180/Math.PI-90}deg)`;
  const d=Math.round(state.pos.distanceTo(new THREE.Vector3(next.x,next.y,next.z)));
  $('objdist').textContent=`RING ${state.ringIdx+1} · ${d} m`;
}
function updateHUD(){
  $('score').textContent=state.score;
  const t=Math.floor(state.time); $('clock').textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  $('alt').textContent=`${Math.max(0,Math.round(state.pos.y))} m`;
  $('spd').textContent=`${Math.round(state.speed*2.1)} kt`;
  const hd=((state.heading*180/Math.PI)%360+360)%360;
  $('hdg').textContent=`${String(Math.round(hd)).padStart(3,'0')}°`;
  $('fuelpct').textContent=`${Math.max(0,Math.round(state.fuel))}%`;
  $('fuelbar').style.width=`${Math.max(0,Math.min(100,state.fuel))}%`;
  const low=state.fuel<22 && state.mode==='fly';
  $('fuelwrap').className='bar'+(low?' low':'');
  $('lowfuel').style.display=low?'block':'none';
  $('wind').textContent = Math.abs(state.wind)<0.4?'calm':(state.wind>0?'→ gust':'← gust');
  const next=RINGS[state.ringIdx];
  $('ringdist').textContent = next? `${Math.round(state.pos.distanceTo(new THREE.Vector3(next.x,next.y,next.z)))} m` : 'route clear';
  const b=beacons.find(b=>!b.lit);
  if(b){ $('keeper').textContent=`${b.island.keeper} · ${b.island.name}`;
    $('keepermedal').textContent=b.island.keeper.replace('Keeper ','').replace('Postmaster ','')[0];
    $('request').textContent=`“${b.island.req}”`; }
  else { $('keeper').textContent='All keepers lit'; $('keepermedal').textContent='✦';
    $('request').textContent='“The archipelago glows. Come home, pilot.”'; }
  goalsHTML();
  drawHorizon(); drawRadar(); drawCompass(); drawTapes(); updateObjective();
}
function drawHorizon(){
  const c=$('horizon').getContext('2d'); const W=332,H=128;
  c.clearRect(0,0,W,H);
  c.save(); c.translate(W/2,H/2); c.rotate(-state.roll);
  const off=state.pitch*120;
  c.fillStyle='#7db8e8'; c.fillRect(-W,-H+off,W*2,H);
  c.fillStyle='#7a5a38'; c.fillRect(-W,off,W*2,H);
  c.strokeStyle='#fff'; c.lineWidth=2; c.beginPath(); c.moveTo(-W,off); c.lineTo(W,off); c.stroke();
  c.restore();
  c.strokeStyle='#ffd98a'; c.lineWidth=3;
  c.beginPath(); c.moveTo(W/2-46,H/2); c.lineTo(W/2-14,H/2); c.lineTo(W/2,H/2+8); c.lineTo(W/2+14,H/2); c.lineTo(W/2+46,H/2); c.stroke();
}
function worldToMap(x,z,W,H){ return [ (x+1300)/2600*W, (z+1300)/2600*H ]; }
function drawMapBase(c,W,H){
  c.fillStyle='#1d4e6e'; c.fillRect(0,0,W,H);
  for(const s of ALL_ISLES){ const [x,y]=worldToMap(s.x,s.z,W,H);
    c.fillStyle='#5f9e57'; c.beginPath(); c.arc(x,y,s.r/2600*W,0,7); c.fill();
    c.fillStyle='#e8cf9a'; c.beginPath(); c.arc(x,y,s.r/2600*W*0.45,0,7); c.fill(); }
  c.strokeStyle='rgba(255,217,138,.85)'; c.lineWidth=2; c.beginPath();
  RINGS.forEach((r,i)=>{ const [x,y]=worldToMap(r.x,r.z,W,H); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke();
  RINGS.forEach((r,i)=>{ const [x,y]=worldToMap(r.x,r.z,W,H);
    c.fillStyle = r.hit?'#9fe8b1':(i===state.ringIdx?'#fff':'#ffd98a');
    c.beginPath(); c.arc(x,y,i===state.ringIdx?4:2.6,0,7); c.fill(); });
  for(const b of beacons){ const [x,y]=worldToMap(b.island.x,b.island.z,W,H);
    c.fillStyle=b.lit?'#ffe9b0':'#ff9d5c'; c.fillRect(x-3,y-3,6,6); }
  const [px,py]=worldToMap(state.pos.x,state.pos.z,W,H);
  c.save(); c.translate(px,py); c.rotate(state.heading);
  c.fillStyle='#fff'; c.beginPath(); c.moveTo(0,-7); c.lineTo(5,6); c.lineTo(-5,6); c.closePath(); c.fill(); c.restore();
}
function drawRadar(){
  const c=$('minimap').getContext('2d'); const W=210,H=210,CX=105,CY=105,R=100;
  c.clearRect(0,0,W,H);
  // scope face
  const face=c.createRadialGradient(CX,CY,8,CX,CY,R);
  face.addColorStop(0,'#0d2b22'); face.addColorStop(0.7,'#081f18'); face.addColorStop(1,'#04120d');
  c.fillStyle=face; c.beginPath(); c.arc(CX,CY,R,0,7); c.fill();
  c.save(); c.beginPath(); c.arc(CX,CY,R,0,7); c.clip();
  const scale=R/1350; // world units -> px, north-up
  const toXY=(x,z)=>[CX+x*scale, CY+z*scale];
  // terrain returns (islands glow like ground clutter)
  for(const s of ALL_ISLES){ const [x,y]=toXY(s.x,s.z);
    c.fillStyle='rgba(120,220,150,.34)'; c.beginPath(); c.arc(x,y,s.r*scale,0,7); c.fill();
    c.fillStyle='rgba(180,255,200,.28)'; c.beginPath(); c.arc(x,y,s.r*scale*0.5,0,7); c.fill(); }
  // route trace
  c.strokeStyle='rgba(255,217,138,.55)'; c.lineWidth=1.2; c.beginPath();
  RINGS.forEach((r,i)=>{ const [x,y]=toXY(r.x,r.z); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke();
  // range rings + bearing spokes
  c.strokeStyle='rgba(120,255,190,.4)'; c.lineWidth=1;
  for(const rr of [R*0.33,R*0.66,R*0.97]){ c.beginPath(); c.arc(CX,CY,rr,0,7); c.stroke(); }
  c.strokeStyle='rgba(120,255,190,.22)';
  for(let a=0;a<12;a++){ const t=a*Math.PI/6; c.beginPath(); c.moveTo(CX,CY); c.lineTo(CX+Math.cos(t)*R,CY+Math.sin(t)*R); c.stroke(); }
  // sweep (deterministic from run time so screenshots are stable)
  const sweep=(state.time*0.9)%(Math.PI*2);
  const grad=c.createConicGradient ? null : null;
  c.fillStyle='rgba(120,255,190,.20)';
  c.beginPath(); c.moveTo(CX,CY); c.arc(CX,CY,R,sweep-0.55,sweep); c.closePath(); c.fill();
  c.strokeStyle='rgba(190,255,220,.95)'; c.lineWidth=2;
  c.beginPath(); c.moveTo(CX,CY); c.lineTo(CX+Math.cos(sweep)*R,CY+Math.sin(sweep)*R); c.stroke();
  // ring blips
  RINGS.forEach((r,i)=>{ const [x,y]=toXY(r.x,r.z);
    c.fillStyle = r.hit?'#9fe8b1':(i===state.ringIdx?'#ffffff':'#ffd98a');
    c.beginPath(); c.arc(x,y,i===state.ringIdx?3.4:2.2,0,7); c.fill();
    if(i===state.ringIdx){ c.strokeStyle='rgba(255,255,255,.8)'; c.beginPath(); c.arc(x,y,6.5,0,7); c.stroke(); } });
  // keeper beacons
  for(const b of beacons){ const [x,y]=toXY(b.island.x,b.island.z);
    c.fillStyle=b.lit?'#ffe9b0':'#ff9d5c'; c.fillRect(x-2.6,y-2.6,5.2,5.2); }
  // own ship
  const [px,py]=toXY(state.pos.x,state.pos.z);
  c.save(); c.translate(px,py); c.rotate(state.heading);
  c.fillStyle='#ffffff'; c.beginPath(); c.moveTo(0,-7); c.lineTo(5,6); c.lineTo(-5,6); c.closePath(); c.fill();
  c.restore();
  c.restore();
  // cardinal letters
  c.fillStyle='#bff3d8'; c.font='bold 10px Trebuchet MS, sans-serif'; c.textAlign='center';
  c.fillText('N',CX,13); c.fillText('S',CX,H-5); c.fillText('W',10,CY+3); c.fillText('E',W-10,CY+3);
}
function drawBigMap(){
  const c=$('bigmap').getContext('2d'); const W=752,H=420;
  c.fillStyle='#f3e5c3'; c.fillRect(0,0,W,H);
  c.strokeStyle='rgba(184,155,94,.35)'; c.lineWidth=1;
  for(let x=0;x<W;x+=47){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke(); }
  for(let y=0;y<H;y+=42){ c.beginPath(); c.moveTo(0,y); c.lineTo(W,y); c.stroke(); }
  for(const s of ALL_ISLES){ const [x,y]=worldToMap(s.x,s.z,W,H);
    c.fillStyle='#a8c686'; c.beginPath(); c.arc(x,y,s.r/2600*W,0,7); c.fill();
    c.strokeStyle='#7a9a58'; c.stroke();
    c.fillStyle='#e8cf9a'; c.beginPath(); c.arc(x,y,s.r/2600*W*0.45,0,7); c.fill(); }
  c.strokeStyle='#b8742a'; c.lineWidth=2.4; c.setLineDash([7,5]); c.beginPath();
  RINGS.forEach((r,i)=>{ const [x,y]=worldToMap(r.x,r.z,W,H); i?c.lineTo(x,y):c.moveTo(x,y); }); c.stroke();
  c.setLineDash([]);
  RINGS.forEach((r,i)=>{ const [x,y]=worldToMap(r.x,r.z,W,H);
    c.fillStyle = r.hit?'#5da864':(i===state.ringIdx?'#e2543e':'#c99b4a');
    c.beginPath(); c.arc(x,y,i===state.ringIdx?5:3.2,0,7); c.fill(); });
  for(const b of beacons){ const [x,y]=worldToMap(b.island.x,b.island.z,W,H);
    c.fillStyle=b.lit?'#c99b4a':'#e2543e'; c.fillRect(x-3.5,y-3.5,7,7); }
  const [px,py]=worldToMap(state.pos.x,state.pos.z,W,H);
  c.save(); c.translate(px,py); c.rotate(state.heading);
  c.fillStyle='#274a7d'; c.beginPath(); c.moveTo(0,-8); c.lineTo(6,7); c.lineTo(-6,7); c.closePath(); c.fill(); c.restore();
  c.fillStyle='#6b4a1e'; c.font='bold 13px Georgia, serif';
  for(const s of ISLANDS){ const [x,y]=worldToMap(s.x,s.z,W,H); c.fillText(s.name,x+9,y-7); }
  c.font='11px Georgia, serif'; c.fillStyle='#8a6a3a';
  for(const s of ISLANDS){ const [x,y]=worldToMap(s.x,s.z,W,H); c.fillText(s.keeper,x+9,y+6); }
  // numbered delivery legs on keeper islands
  ISLANDS.forEach((s,i)=>{ const [x,y]=worldToMap(s.x,s.z,W,H);
    c.fillStyle='#274a7d'; c.beginPath(); c.arc(x,y,9,0,7); c.fill();
    c.fillStyle='#fff'; c.font='bold 10px Trebuchet MS, sans-serif'; c.textAlign='center';
    c.fillText(String(i+1),x,y+3.5); c.textAlign='left'; });
  // crosswind arrows over open water
  c.strokeStyle='rgba(39,74,125,.65)'; c.lineWidth=1.6;
  for(const [wx,wz] of [[-150,-80],[180,90],[40,-300]]){
    const [x,y]=worldToMap(wx,wz,W,H); const dir=state.wind>=0?1:-1;
    c.beginPath(); c.moveTo(x-16*dir,y); c.lineTo(x+16*dir,y);
    c.lineTo(x+9*dir,y-4); c.moveTo(x+16*dir,y); c.lineTo(x+9*dir,y+4); c.stroke();
  }
  c.fillStyle='#274a7d'; c.font='bold 10px Trebuchet MS, sans-serif';
  c.fillText('CROSSWIND', ...(()=>{ const [x,y]=worldToMap(-150,-80,W,H); return [x-22,y-9]; })());
  // scale bar
  c.strokeStyle='#6b4a1e'; c.lineWidth=2; c.beginPath(); c.moveTo(24,H-22); c.lineTo(24+500/2600*W,H-22); c.stroke();
  c.fillStyle='#6b4a1e'; c.font='10px Georgia, serif'; c.fillText('500 m',24,H-28);
  // compass rose
  c.save(); c.translate(W-52,48); c.strokeStyle='#8a6a3a'; c.fillStyle='#8a6a3a';
  c.beginPath(); c.arc(0,0,20,0,7); c.stroke();
  c.beginPath(); c.moveTo(0,-20); c.lineTo(4,0); c.lineTo(-4,0); c.closePath(); c.fill();
  c.font='bold 12px Georgia, serif'; c.textAlign='center'; c.fillText('N',0,-25); c.restore();
}

// ---------- screens & menus ----------
let routeOpen=false, routeReturn=null;
const SCREENS=['title','brief','help','hangar','pause','results'];
function showScreen(name){
  for(const s of SCREENS) $('screen-'+s).classList.toggle('open', s===name);
  document.body.classList.toggle('menu', ['title','brief','help','hangar'].includes(name));
  if(name==='title'){ state.mode='title'; $('title-best').textContent = state.best? `${state.best}` : '—'; }
  if(name==='brief') state.mode='brief';
  if(name==='hangar') renderHangar();
  if(name) beep(520,0.08,'sine',0.05);
}
function hideScreens(){ for(const s of SCREENS) $('screen-'+s).classList.remove('open'); document.body.classList.remove('menu'); }
function toggleRoute(){
  routeOpen=!routeOpen;
  $('route').classList.toggle('open', routeOpen);
  if(routeOpen){ drawBigMap(); beep(580,0.08,'sine',0.05); }
}
function pauseFlight(){ if(state.mode!=='fly') return; state.mode='pause'; showScreen('pause'); }
function resumeFlight(){ if(state.mode!=='pause') return; state.mode='fly'; hideScreens(); beep(660,0.1); }
function renderHangar(){
  const nextIdx = UPGRADES.findIndex(u=>!state.upgrades.has(u.id));
  $('hangar-cards').innerHTML = UPGRADES.map((u,i)=>{
    const on=state.upgrades.has(u.id);
    const st = on? '<span class="st on">FITTED ✓</span>' : (i===nextIdx? '<span class="st next">NEXT UNLOCK</span>' : '<span class="st lock">LOCKED</span>');
    return `<div class="upcard${on?'':' locked'}"><div class="ic">${u.icon}</div><h4>${u.name}</h4><p>${u.desc}</p>${st}</div>`;
  }).join('');
}
document.querySelectorAll('[data-action]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const a=btn.dataset.action; beep(700,0.07,'sine',0.06);
    if(a==='play') showScreen('brief');
    else if(a==='takeoff') startRun();
    else if(a==='help') showScreen('help');
    else if(a==='hangar') showScreen('hangar');
    else if(a==='title'){ if(routeOpen) toggleRoute(); showScreen('title'); }
    else if(a==='route'){ routeReturn=state.mode; toggleRoute(); }
    else if(a==='closeroute') toggleRoute();
    else if(a==='resume') resumeFlight();
    else if(a==='restart') startRun();
  });
});

// ---------- gameplay ----------
function startRun(){
  state.mode='fly'; state.runs++;
  state.pos.set(-260,60,430); state.pitch=0; state.roll=0; state.heading=Math.PI;
  state.speed = state.upgrades.has('engine')?54:42;
  state.fuel = state.upgrades.has('tank')?140:100;
  state.lanterns = state.upgrades.has('rack')?5:3;
  state.score=0; state.time=0; state.ringIdx=0; state.deliveries=0;
  for(const r of RINGS) r.hit=false;
  for(const b of beacons){ b.lit=false; b.orb.material.color.set(0xffca6a); b.beam.visible=false; }
  for(const d of state.dropped) scene.remove(d.mesh);
  state.dropped=[];
  hideScreens(); if(routeOpen) toggleRoute();
  $('banner').style.display='none';
  toast('Dawn run started — follow the rings');
  beep(660,0.15);
}
function dropLantern(){
  if(state.lanterns<=0){ toast('No lanterns left — thread rings to earn more'); return; }
  state.lanterns--;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1.1,10,10), new THREE.MeshBasicMaterial({color:0xffca6a}));
  mesh.position.copy(state.pos).y-=2;
  const light=new THREE.PointLight(0xffb95e,300,80); mesh.add(light);
  scene.add(mesh);
  state.dropped.push({mesh, vy:-2});
  beep(520,0.2);
}
function finishRun(won){
  state.mode='done';
  state.best=Math.max(state.best,state.score);
  const grade = state.score>=2600?'S':state.score>=1900?'A':state.score>=1200?'B':state.score>=600?'C':'D';
  let unlocked=null;
  if(won){
    unlocked = UPGRADES.find(u=>!state.upgrades.has(u.id)) || null;
    if(unlocked) state.upgrades.add(unlocked.id);
  }
  $('res-grade').textContent=grade;
  $('res-title').textContent = won?'ROUTE COMPLETE':'RUN OVER';
  $('res-body').textContent = won
    ? 'Every keeper lit, every ring threaded. The archipelago wakes under a string of lantern light — and Postmaster Rue puts the kettle on.'
    : 'The little post plane glides in for a landing. The rings will still be there at dawn.';
  $('res-rings').textContent=`${state.ringIdx}/30`;
  $('res-deliv').textContent=`${state.deliveries}/6`;
  const t=Math.floor(state.time); $('res-time').textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  $('res-score').textContent=state.score;
  const up=$('res-upgrade');
  if(unlocked){ up.style.display='block'; up.innerHTML=`${unlocked.icon} Upgrade unlocked: <b>${unlocked.name}</b> — ${unlocked.desc}`; }
  else up.style.display='none';
  showScreen('results');
  beep(won?880:330,0.4);
}

const clock=new THREE.Clock();
function step(dt){
  if(state.mode!=='fly') return;
  state.time+=dt;
  // controls
  const pitchIn = (keys.ArrowUp?-1:0)+(keys.ArrowDown?1:0) + (mouseSeen? mouseY*0.7:0);
  const rollIn = (keys.ArrowLeft?-1:0)+(keys.ArrowRight?1:0) + (mouseSeen? mouseX*0.8:0);
  const yawIn = (keys.KeyA?-1:0)+(keys.KeyD?1:0);
  state.pitch = THREE.MathUtils.clamp(state.pitch + pitchIn*dt*1.1, -0.65, 0.65);
  state.roll = THREE.MathUtils.clamp(state.roll + rollIn*dt*1.6 - state.roll*dt*1.4, -1.1, 1.1);
  state.heading += (Math.sin(state.roll)*0.85 + yawIn*0.35)*dt;
  const boost = keys.ShiftLeft||keys.ShiftRight;
  const targetSpeed = (state.upgrades.has('engine')?54:42) * (boost?1.45:1) * (1 - state.pitch*0.35);
  state.speed += (targetSpeed-state.speed)*dt*0.8;
  // wind
  state.windT+=dt;
  state.wind = Math.sin(state.windT*0.23)*Math.sin(state.windT*0.071+2)*(state.upgrades.has('sails')?0.5:1);
  // move
  const fwd=new THREE.Vector3(Math.sin(state.heading)*Math.cos(state.pitch), -Math.sin(state.pitch), -Math.cos(state.heading)*Math.cos(state.pitch));
  state.pos.addScaledVector(fwd, state.speed*dt);
  state.pos.x += state.wind*dt*6;
  // fuel
  state.fuel -= dt*(boost?2.4:1.15);
  // bounds + ground
  state.pos.x=THREE.MathUtils.clamp(state.pos.x,-1250,1250);
  state.pos.z=THREE.MathUtils.clamp(state.pos.z,-1250,1250);
  const groundY=Math.max(terrainHeight(state.pos.x,state.pos.z),0)+4;
  if(state.pos.y<groundY){ state.pos.y=groundY; state.pitch=Math.min(state.pitch,0.1); }
  state.pos.y=Math.min(state.pos.y,320);
  // rings
  const next=RINGS[state.ringIdx];
  if(next){
    const d=state.pos.distanceTo(new THREE.Vector3(next.x,next.y,next.z));
    if(d<13){ next.hit=true; state.ringIdx++; state.score+=80;
      popup(`+80 · RING ${state.ringIdx}/30`);
      if(state.ringIdx%6===0 && state.lanterns<6){ state.lanterns++; toast('Ring bonus — lantern earned'); }
      beep(740+state.ringIdx*12,0.16);
    }
  }
  // dropped lanterns
  for(const d of state.dropped){
    if(d.done) continue;
    d.mesh.position.y += d.vy*dt; d.vy-=6*dt;
    const gy=Math.max(terrainHeight(d.mesh.position.x,d.mesh.position.z),0)+2;
    if(d.mesh.position.y<=gy){
      d.done=true; d.mesh.position.y=gy;
      let delivered=false;
      for(const b of beacons){
        if(!b.lit && Math.hypot(d.mesh.position.x-b.island.x, d.mesh.position.z-b.island.z)<b.island.r*0.9){
          b.lit=true; b.orb.material.color.set(0xfff3c4); b.beam.visible=true; state.deliveries++; state.score+=220; delivered=true;
          popup(`+220 · DELIVERED`); toast(`Delivered — ${b.island.keeper} is lit`); beep(980,0.3);
          break;
        }
      }
      if(!delivered){ state.score+=15; toast('Lantern lit the shore'); }
    }
  }
  // win / lose
  const home=ISLANDS[5];
  const nearHome=Math.hypot(state.pos.x-home.x,state.pos.z-home.z)<90 && state.pos.y<terrainHeight(home.x,home.z)+30;
  if(state.ringIdx>=30 && state.deliveries>=6 && nearHome){ state.score+=Math.max(0,Math.round(state.fuel))*4; finishRun(true); }
  else if(state.fuel<=0){ finishRun(false); }
  // plane transform
  plane.position.copy(state.pos);
  plane.rotation.set(0,0,0);
  plane.rotateY(state.heading+Math.PI);
  plane.rotateX(-state.pitch);
  plane.rotateZ(-state.roll);
  plane.userData.prop.rotation.z += dt*40;
  // rings face the plane, pulse the next one
  paintRings();
  ringMeshes.forEach((rm,i)=>{
    rm.group.lookAt(state.pos.x, rm.group.position.y, state.pos.z);
    const s = i===state.ringIdx? 1+Math.sin(state.time*5)*0.07 : (RINGS[i].hit?0.92:1);
    rm.group.scale.set(s,s,s);
  });
  for(const c of clouds) c.position.x += dt*2.2;
  stepWind(dt);
  updateHUD();
}
function camPose(){
  const fwd=new THREE.Vector3(Math.sin(state.heading),0,-Math.cos(state.heading));
  if(state.cam==='cockpit'){
    const eye=state.pos.clone().add(new THREE.Vector3(0,3.7,0)).addScaledVector(fwd,3.4);
    const look=state.pos.clone().addScaledVector(fwd,60).add(new THREE.Vector3(0,-state.pitch*34-1.5,0));
    return {eye,look};
  }
  if(state.cam==='cine'){
    const side=new THREE.Vector3(fwd.z,0,-fwd.x);
    const eye=state.pos.clone().addScaledVector(side,30).addScaledVector(fwd,-10).add(new THREE.Vector3(0,7,0));
    return {eye, look:state.pos.clone().addScaledVector(fwd,26)};
  }
  const eye=state.pos.clone().addScaledVector(fwd,-30).add(new THREE.Vector3(0,10,0));
  const look=state.pos.clone().addScaledVector(fwd,44).add(new THREE.Vector3(0,-state.pitch*30+3,0));
  return {eye,look};
}
function updateCamera(dt){
  const {eye,look}=camPose();
  camera.position.lerp(eye, state.cam==='cockpit'?1:Math.min(1,dt*4.5));
  camera.lookAt(look);
}

// ---------- deterministic screenshot poses ----------
function poseCover(){
  // mid-action: banking toward the next ring, Brine Isle + beacon ahead, HUD full
  state.mode='fly'; state.time=47; state.score=1240; state.lanterns=3; state.fuel=72;
  state.ringIdx=7; state.deliveries=2;
  for(let i=0;i<7;i++) RINGS[i].hit=true;
  beacons[0].lit=true; beacons[0].beam.visible=true;
  beacons[1].lit=true; beacons[1].beam.visible=true;
  const r=RINGS[7];
  state.pos.set(r.x-34, r.y+9, r.z+108);
  state.heading=Math.atan2(r.x-state.pos.x, -(r.z-state.pos.z));
  state.pitch=0.06; state.roll=0.3; state.speed=52; state.wind=0.6;
  popup('+80 · RING 7/30');
}
function posePlay(){
  state.mode='fly'; state.cam='cockpit'; state.time=96; state.score=1980; state.lanterns=2; state.fuel=48;
  state.ringIdx=16; state.deliveries=3;
  for(let i=0;i<16;i++) RINGS[i].hit=true;
  for(let i=0;i<3;i++){ beacons[i].lit=true; beacons[i].beam.visible=true; }
  const r=RINGS[16];
  state.pos.set(r.x+46, r.y-2, r.z+112);
  state.heading=Math.atan2(r.x-state.pos.x, -(r.z-state.pos.z));
  state.pitch=-0.04; state.roll=-0.2; state.speed=58; state.wind=-0.5;
}
function poseEnd(){
  posePlay();
  state.cam='chase';
  state.ringIdx=30; state.deliveries=6; state.score=3120; state.fuel=31; state.time=214;
  for(const r of RINGS) r.hit=true;
  for(const b of beacons){ b.lit=true; b.beam.visible=true; }
  const home=ISLANDS[5];
  state.pos.set(home.x+16, terrainHeight(home.x,home.z)+22, home.z+120);
  state.heading=Math.PI; state.pitch=0.04; state.roll=0.1;
  state.runs=1; finishRun(true);
}
function applyPose(){
  buildPips();
  if(SHOT){ document.body.classList.add('frozen'); hideScreens(); }
  if(SHOT==='cover') poseCover();
  else if(SHOT==='play') posePlay();
  else if(SHOT==='route'){ poseCover(); toggleRoute(); }
  else if(SHOT==='end') poseEnd();
  else if(SHOT==='title'){ poseCover(); showScreen('title'); }
  else { state.mode='title'; showScreen('title'); }
  // settle plane + camera instantly for a stable frame
  plane.position.copy(state.pos);
  plane.rotation.set(0,0,0); plane.rotateY(state.heading+Math.PI); plane.rotateX(-state.pitch); plane.rotateZ(-state.roll);
  paintRings();
  ringMeshes.forEach(rm=>{ rm.group.lookAt(state.pos.x,rm.group.position.y,state.pos.z); });
  $('chip-cam').textContent='CAM: '+state.cam.toUpperCase();
  const {eye,look}=camPose();
  camera.position.copy(eye);
  camera.lookAt(look);
  updateHUD();
}
applyPose();

let frames=0;
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),0.05);
  if(SHOT){ // frozen deterministic frame: gentle prop + water only
    plane.userData.prop.rotation.z += dt*30;
    waterMat.uniforms.uTime.value = frames*0.045;
  } else {
    waterMat.uniforms.uTime.value += dt;
    step(dt);
    if(state.mode==='fly'||state.mode==='pause') updateCamera(dt);
    else if(state.mode==='title'||state.mode==='brief'){
      // slow menu orbit around the parked post plane
      const a=frames*0.0016;
      camera.position.set(state.pos.x+Math.sin(a)*46, state.pos.y+13, state.pos.z+Math.cos(a)*46);
      camera.lookAt(state.pos.x, state.pos.y+2, state.pos.z);
      plane.userData.prop.rotation.z += dt*6;
    }
  }
  renderer.render(scene,camera);
  frames++;
  if(SHOT && frames===12) document.title='shot-ready';
}
loop();
