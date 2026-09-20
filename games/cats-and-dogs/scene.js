import * as THREE from './vendor/three.module.js';
import {PIECES} from './engine.js';

const COLORS = {cat:0x388286, dog:0xd88a4c};
const SCALES = {1:0.57,2:0.79,3:1.02};
const BOARD_Y = 0.23;
const cellPosition = cell => new THREE.Vector3((cell % 3 - 1)*1.74,BOARD_Y,(Math.floor(cell/3)-1)*1.74);

export class BoardScene {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.OrthographicCamera(-8,8,5,-5,.1,100);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.models = new Map();
    this.homes = new Map();
    this.targets = [];
    this.hover = -1;
    this.keyboardCell = -1;
    this.draggingId = null;
    this.frame = null;
    this.materials = new Map();
    this.sphereGeometry = new THREE.SphereGeometry(1,24,16);
    this.makeTable();
    this.makeBoard();
    for(const piece of PIECES) {
      const model = this.makePiece(piece);
      this.models.set(piece.id,model);
      this.scene.add(model);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    this.resize();
  }
  material(color,roughness=.7) {
    const key = `${color}-${roughness}`;
    if(!this.materials.has(key)) this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));
    return this.materials.get(key);
  }
  mesh(geometry,material,parent,x=0,y=0,z=0) {
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  ball(parent,color,x,y,z,sx,sy=sx,sz=sx) {
    const mesh = this.mesh(this.sphereGeometry,this.material(color),parent,x,y,z);
    mesh.scale.set(sx,sy,sz);
    return mesh;
  }
  roundedBox(w,h,d,r,color,parent,x=0,y=0,z=0) {
    const shape = new THREE.Shape();
    shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);
    shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);
    shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.04,curveSegments:6});
    geometry.rotateX(-Math.PI/2);
    return this.mesh(geometry,this.material(color),parent,x,y,z);
  }
  makeTable() {
    this.scene.add(new THREE.HemisphereLight(0xfff8e7,0xc0c4ac,2.6));
    const key = new THREE.DirectionalLight(0xfff8ea,3.5);
    key.position.set(-5,10,7);
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=10;key.shadow.camera.bottom=-10;
    key.shadow.camera.near=.1;key.shadow.camera.far=35;key.shadow.normalBias=.045;key.shadow.bias=-.0001;key.shadow.radius=3;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdcebef,1.4);fill.position.set(7,6,-5);this.scene.add(fill);
    const floor = this.mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0xcfd1b7,roughness:1}),this.scene,0,-.42,0);
    floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    this.trays = {};
    for(const owner of ['cat','dog']) {
      const group = new THREE.Group();this.scene.add(group);
      this.trays[owner] = group;
    }
  }
  makeBoard() {
    this.roundedBox(5.85,.32,5.85,.27,0x9b683c,this.scene,0,-.30,0);
    this.roundedBox(5.7,.08,5.7,.24,0xdcb980,this.scene,0,.05,0);
    for(let i=0;i<9;i++) {
      const pos = cellPosition(i);
      this.roundedBox(1.61,.035,1.61,.12,i%2 ? 0xe4c794 : 0xe9d09e,this.scene,pos.x,.14,pos.z);
      const target = this.mesh(new THREE.BoxGeometry(1.58,.012,1.58),new THREE.MeshBasicMaterial({color:0x74b1a1,transparent:true,opacity:0,depthWrite:false}),this.scene,pos.x,.221,pos.z);
      target.castShadow=false;target.userData.cell=i;this.targets.push(target);
    }
    for(const axis of ['x','z']) for(const offset of [-.87,.87]) {
      const beam = this.roundedBox(.11,.15,5.44,.04,0xad794b,this.scene,axis==='x'?offset:0,.17,axis==='z'?offset:0);
      if(axis==='z') beam.rotation.y = Math.PI/2;
      for(const end of [-2.67,2.67]) {
        const x = axis==='x' ? offset : end, z = axis==='x' ? end : offset;
        this.mesh(new THREE.CylinderGeometry(.10,.11,.30,16),this.material(0x95663b),this.scene,x,.26,z);
        this.ball(this.scene,0xc49863,x,.415,z,.102,.055,.102);
      }
    }
    // Small brass corner studs make the board read as a physical wooden object.
    for(const x of [-2.64,2.64]) for(const z of [-2.64,2.64]) this.ball(this.scene,0xd8aa5b,x,.17,z,.053,.021,.053);
  }
  makePiece(piece) {
    const group = new THREE.Group();group.userData.pieceId=piece.id;
    group.scale.setScalar(SCALES[piece.size]);
    const color = COLORS[piece.owner];
    // A rounded hollow-cup silhouette with animal features; only top pieces render.
    const points = [[.50,.03],[.55,.09],[.55,.22],[.50,.40],[.44,.62],[.41,.80],[.33,.97],[.18,1.06],[0,1.09]].map(([x,y])=>new THREE.Vector2(x,y));
    this.mesh(new THREE.LatheGeometry(points,40),this.material(color,.46),group);
    this.mesh(new THREE.TorusGeometry(.515,.025,8,40),this.material(piece.owner==='cat'?0x28656b:0xad6234),group,0,.075,0).rotation.x=Math.PI/2;
    const cream = 0xffe7ba, dark = 0x233b3b;
    if(piece.owner==='cat') {
      for(const side of [-1,1]) {
        const ear = this.mesh(new THREE.ConeGeometry(.21,.46,3),this.material(color,.55),group,side*.29,1.08,-.015);
        ear.rotation.z=-side*.22;ear.rotation.y=Math.PI;
        const inner=this.mesh(new THREE.ConeGeometry(.115,.26,3),this.material(0xcda69b),group,side*.29,1.09,.094);
        inner.rotation.z=-side*.22;inner.rotation.y=Math.PI;
      }
      this.ball(group,cream,0,.42,.412,.33,.29,.10);
      this.ball(group,0xa8cccc,-.24,.96,-.02,.10,.05,.15);
    }else{
      for(const side of [-1,1]){
        const ear=this.ball(group,0x8d5137,side*.415,.76,.015,.16,.35,.22);ear.rotation.z=side*.20;
      }
      this.ball(group,cream,0,.52,.385,.32,.24,.16);
      this.ball(group,0xf4cf94,-.15,.98,-.02,.12,.075,.14);
    }
    for(const side of [-1,1]){
      this.ball(group,dark,side*.172,.765,.35,.054,.069,.04);
      this.ball(group,0xffffff,side*.172-.012,.789,.383,.016,.019,.012);
      this.ball(group,piece.owner==='cat'?0x6ca8a5:0xe5a276,side*.295,.635,.355,.070,.033,.02);
    }
    this.ball(group,piece.owner==='cat'?0x825f59:dark,0,.638,.483,.059,.04,.045);
    const mouthMaterial = this.material(dark);
    for(const side of [-1,1]){
      const mouth = this.mesh(new THREE.TorusGeometry(.063,.010,6,14,Math.PI*.76),mouthMaterial,group,side*.047,.583,.49);
      mouth.rotation.z = side===1 ? Math.PI*.90 : Math.PI*1.34;
    }
    if(piece.owner==='cat') for(const side of [-1,1]) for(const dy of [-.035,.035]){
      const whisker=this.mesh(new THREE.CylinderGeometry(.009,.009,.16,6),this.material(0x23585c),group,side*.30,.57+dy,.41);
      whisker.rotation.z=side*(Math.PI/2+dy*3);
    }
    // Size is encoded both in geometry and in one / two / three cream dots.
    for(let i=0;i<piece.size;i++) this.ball(group,cream,(i-(piece.size-1)/2)*.13,.24,.505,.028,.028,.018);
    group.traverse(child=>{if(child.isMesh)child.userData.pieceId=piece.id;});
    return group;
  }
  resize() {
    const {width,height} = this.canvas.getBoundingClientRect();
    if(!width || !height)return;
    this.mobile = width < 700;
    this.renderer.setSize(width,height,false);
    const aspect = width/height;
    const viewHeight = this.mobile ? Math.max(9.2,7.25/aspect) : Math.max(8.1,13.4/aspect);
    this.camera.left=-viewHeight*aspect/2;this.camera.right=viewHeight*aspect/2;
    this.camera.top=viewHeight/2;this.camera.bottom=-viewHeight/2;
    this.camera.position.set(this.mobile?.7:3.4,15,17);
    this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    for(const owner of ['cat','dog']) {
      const tray = this.trays[owner];
      while(tray.children.length){const child=tray.children[0];tray.remove(child);child.geometry?.dispose();}
      if(this.mobile) this.roundedBox(6.1,.06,1.26,.25,owner==='cat'?0xd5ded0:0xe5d9c1,tray,0,-.18,owner==='cat'?4.3:-4.3);
      else this.roundedBox(2.40,.06,5.12,.32,owner==='cat'?0xd5ded0:0xe5d9c1,tray,owner==='cat'?-4.45:4.45,-.18,0);
      for(const piece of PIECES.filter(p=>p.owner===owner)){
        const copy=Number(piece.id.at(-1));
        this.homes.set(piece.id,this.mobile ? new THREE.Vector3((3-piece.size)*2*1.0+copy*1.0-2.5,-.075,owner==='cat'?4.3:-4.3) : new THREE.Vector3((owner==='cat'?-4.45:4.45)+(copy-.5)*1.12,-.075,(piece.size-2)*1.62));
      }
    }
    this.sync();
    this.positionLabels();
  }
  positionLabels() {
    for(const owner of ['cat','dog']) {
      const point=this.mobile?new THREE.Vector3(0,0,owner==='cat'?5.55:-6.25):new THREE.Vector3(owner==='cat'?-4.45:4.45,0,3.03);
      const screen=this.project(point);
      const label=document.getElementById(`${owner}-tray-label`);
      label.style.left=`${screen.x}px`;label.style.top=`${screen.y}px`;
    }
  }
  project(point) {
    const p=point.clone().project(this.camera);
    return {x:(p.x+1)/2*this.canvas.clientWidth,y:(1-p.y)/2*this.canvas.clientHeight};
  }
  pieceScreen(id) {
    const group=this.models.get(id);
    return this.project(group.position.clone().add(new THREE.Vector3(0,.66*SCALES[pieceBySize(id)],0)));
  }
  sync() {
    for(const [id,model] of this.models) {
      const held=this.game.held?.piece.id===id;
      const location=this.game.locate(id);
      model.visible=held || location!==-1;
      if(!model.visible)continue;
      if(held && this.draggingId===id)continue;
      if(held){
        const origin=this.game.held.from===null?this.homes.get(id):cellPosition(this.game.held.from);
        model.position.copy(origin).add(new THREE.Vector3(0,.75,0));
      }else model.position.copy(location===null?this.homes.get(id):cellPosition(location));
      model.rotation.y=this.mobile?.035:.10;
    }
    this.updateTargets();this.invalidate();
  }
  updateTargets() {
    for(let cell=0;cell<9;cell++){
      const target=this.targets[cell];
      const win=this.game.winLine.includes(cell);
      const selected=(cell===this.hover||cell===this.keyboardCell)&&this.game.held&&!this.game.winner;
      target.material.opacity=win?.40:selected?.60:0;
      target.material.color.set(win?0xf1bc50:this.game.canDrop(cell)?0x6eaf91:0xd56b4b);
    }
  }
  setRay(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();
    this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
  }
  pick(clientX,clientY) {
    this.setRay(clientX,clientY);
    this.scene.updateMatrixWorld(true);
    const roots=[...this.models.values()].filter(model=>model.visible);
    const hit=this.raycaster.intersectObjects(roots,true)[0];
    if(hit)return hit.object.userData.pieceId;
    // Expand small pieces to a 44px target without exposing covered pieces.
    const rect=this.canvas.getBoundingClientRect();
    const near=roots.map(model=>{
      const p=this.pieceScreen(model.userData.pieceId);
      return {id:model.userData.pieceId,distance:Math.hypot(p.x+rect.left-clientX,p.y+rect.top-clientY)};
    }).filter(candidate=>candidate.distance<=22).sort((a,b)=>a.distance-b.distance);
    return near[0]?.id ?? null;
  }
  target(clientX,clientY) {
    this.setRay(clientX,clientY);
    const point=new THREE.Vector3();
    if(!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-BOARD_Y),point))return -1;
    const col=Math.round(point.x/1.74)+1,row=Math.round(point.z/1.74)+1;
    if(col<0||col>2||row<0||row>2||Math.abs(point.x-(col-1)*1.74)>.82||Math.abs(point.z-(row-1)*1.74)>.82)return -1;
    return row*3+col;
  }
  dragTo(id,clientX,clientY,touch=false) {
    this.draggingId=id;
    // Put the piece above the finger; the highlighted cell stays under the finger.
    this.setRay(clientX,clientY-(touch?30:12));
    const point=new THREE.Vector3();
    if(this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-1.1),point))this.models.get(id).position.copy(point);
    this.hover=this.target(clientX,clientY);this.updateTargets();this.invalidate();
  }
  finishDrag(){this.draggingId=null;this.hover=-1;this.sync();}
  invalidate() {
    this.renderer.shadowMap.needsUpdate=true;
    if(this.frame!==null)return;
    this.frame=requestAnimationFrame(()=>{this.frame=null;this.renderer.render(this.scene,this.camera);});
  }
  dispose(){this.observer.disconnect();if(this.frame!==null)cancelAnimationFrame(this.frame);this.renderer.dispose();}
}
function pieceBySize(id){return Number(id.split('-')[1]);}
