import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 3D stuff
const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#191919');
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
const light = new THREE.AmbientLight();
scene.add(light);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
//renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
//document.body.appendChild(VRButton.createButton(renderer));

let entities = new Map();

async function init_entity(parent, code=null, url="") {
  // compile and check code
  const module = await (async () => {
    if (code) return WebAssembly.compile(code);
    else return await WebAssembly.compileStreaming(fetch(url));
  })();

  let e_id = 1;
  for (e in entities.keys()) {
    if (e_id == e.id) e_id++;
  }

  const entity = {
    worker: new Worker("entities/entity.js", { type: "module" }),
    parent: parent,
    children: [],
    geometry: null
  };

  entities.set(e_id, entity)

  // set up communication
  entity.worker.addEventListener("message", async (e) => {
    const data = e.data;
    if (data.etype === "geo") { // load geometry
      if (data.gtype === "url") { // load from url
        loader.load(data.url, function (gltf) {
          if (entity.geometry) {
            scene.remove(entity.geometry);
            entity.geometry.dispose();
          }

          const geo = gltf.scene.children[0];
          geo.removeFromParent();
        
          const box = new THREE.Box3().setFromObject(geo);
          const size = box.getSize(new THREE.Vector3()).length();
          const center = box.getCenter(new THREE.Vector3());
        
          geo.position.x += camera.position.x - center.x;
          geo.position.y += camera.position.y - center.y;
          geo.position.z += camera.position.z - center.z;

          geo.position.x -= size / 1.5;
          geo.position.y -= size / 1.5;
          geo.position.z -= size / 1.5;
          camera.lookAt((new THREE.Box3().setFromObject(geo)).getCenter(new THREE.Vector3()));
        
          entity.geometry = geo;
          scene.add(geo);

          data.ret[0] = 0;
        }, undefined, function (err) {
          data.ret[0] = 1;
          console.error(err);
        });
      }

      Atomics.notify(data.ret, 1); // signal to caller that it is complete
    }
  })

  // send code and wait for worker to set up
  let worker_unready = true;
  const ready_listener = (e) => {
    worker_unready = false;
  };
  entity.worker.addEventListener("message", ready_listener);
  while (worker_unready) {
    entity.worker.postMessage({"etype": "init", "module": module});
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  entity.worker.removeEventListener("message", ready_listener);
}

entities.set(0, { // world object
  worker: null,
  parent: null,
  children: entities.keys()
});

init_entity(0, null, "build/entity.release.wasm");

function animate() {
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);