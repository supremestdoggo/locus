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
    geometry: null,
    mirrors: {
      position: null,
      rotation: null,
      scale: null
    }
  };

  entities.set(e_id, entity);

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
    if (e.data.etype === "ready") {
      const buffer = e.data.memory.buffer;
      const pointers = e.data.transformation_pointers;

      const position_mirror_routine = async () => { // manage position mirror
        while (1) {
          await Atomics.waitAsync(pointers, 0, pointers[0]).value;
          if (pointers[0] === -1) entity.mirrors.position = null;
          else {
            entity.mirrors.position = new Float64Array(buffer, pointers[0], 3);
            if (entity.geometry) {
              entity.mirrors.position[0] = entity.geometry.position.x;
              entity.mirrors.position[1] = entity.geometry.position.y;
              entity.mirrors.position[2] = entity.geometry.position.z;
            }
          }
        }
      };
      const rotation_mirror_routine = async () => { // manage rotation mirror
        while (1) {
          await Atomics.waitAsync(pointers, 1, pointers[1]).value;
          if (pointers[1] === -1) entity.mirrors.rotation = null;
          else {
            entity.mirrors.rotation = new Float64Array(buffer, pointers[1], 3);
            if (entity.geometry) {
              entity.mirrors.rotation[0] = entity.geometry.rotation.x;
              entity.mirrors.rotation[1] = entity.geometry.rotation.y;
              entity.mirrors.rotation[2] = entity.geometry.rotation.z;
            }
          }
        }
      };
      const scale_mirror_routine = async () => { // manage scale mirror
        while (1) {
          await Atomics.waitAsync(pointers, 2, pointers[2]).value;
          if (pointers[2] === -1) entity.mirrors.scale = null;
          else {
            entity.mirrors.scale = new Float64Array(buffer, pointers[2], 3);
            if (entity.geometry) {
              entity.mirrors.scale[0] = entity.geometry.scale.x;
              entity.mirrors.scale[1] = entity.geometry.scale.y;
              entity.mirrors.scale[2] = entity.geometry.scale.z;
            }
          }
        }
      };

      position_mirror_routine();
      rotation_mirror_routine();
      scale_mirror_routine();


      worker_unready = false;
    }
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
  for (entity in entities.values()) {
    if (entity.geometry) {
      if (entity.mirrors.position) {
        entity.geometry.position.x = entity.mirrors.position[0];
        entity.geometry.position.y = entity.mirrors.position[1];
        entity.geometry.position.z = entity.mirrors.position[2];
      }
      if (entity.mirrors.rotation) {
        entity.geometry.rotation.x = entity.mirrors.rotation[0];
        entity.geometry.rotation.y = entity.mirrors.rotation[1];
        entity.geometry.rotation.z = entity.mirrors.rotation[2];
      }
      if (entity.mirrors.scale) {
        entity.geometry.scale.x = entity.mirrors.scale[0];
        entity.geometry.scale.y = entity.mirrors.scale[1];
        entity.geometry.scale.z = entity.mirrors.scale[2];
      }
    }
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);