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


const generateSharedTypedArray = (array_type, elements) => {
  return new array_type(new SharedArrayBuffer(elements * array_type.BYTES_PER_ELEMENT));
};

const signal_clock = generateSharedTypedArray(Int32Array, 2);
const delta_clock = new Float32Array(signal_clock.buffer);

let entities = new Map();

async function init_entity(parent, code=null, url="", port) {
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
    geometry: null,
    mirrors: {
      position: null,
      rotation: null,
      scale: null,
      camera_position: null,
      camera_rotation: null
    },
    parent_id: parent,
    children: []
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
        
          //geo.position.x += camera.position.x - center.x;
          //geo.position.y += camera.position.y - center.y;
          //geo.position.z += camera.position.z - center.z;

          //geo.position.x -= size / 1.5;
          //geo.position.y -= size / 1.5;
          //geo.position.z -= size / 1.5;
          //camera.lookAt((new THREE.Box3().setFromObject(geo)).getCenter(new THREE.Vector3()));
        
          entity.geometry = geo;
          scene.add(geo);

          data.ret[0] = 0;
          Atomics.notify(data.ret, 1); // signal to caller that it is complete
        }, undefined, function (err) {
          data.ret[0] = 1;
          console.error(err);
          Atomics.notify(data.ret, 1); // signal to caller that it is complete
        });
      }
    } else if (data.etype === "spawn_entity") { // spawn entity
      const internal_data = data.data;
      const origin = internal_data.origin;
      let child_id;

      if (origin === "url") child_id = init_entity(e_id, null, internal_data.url, data.port); // spawn from url
      entity.children.push(child_id);

      data.id_arr[0] = child_id;
      Atomics.notify(data.id_arr, 0);
    }
  });
  const entity_death_signal = generateSharedTypedArray(Int32Array, 1);
  Atomics.waitAsync(entity_death_signal, 0, 0).value.then(() => {
    entity.worker.terminate();
    if (parent != 0) entities.get(parent).worker.postMessage({
      "etype": "death",
      "id": e_id
    });
    entities.delete(e_id);
  });

  // send code and wait for worker to set up
  let worker_unready = true;
  const ready_listener = (e) => {
    if (e.data.etype === "ready") {
      if (port) {
        // link message ports (this should probably be replaced with a better solution someday, as it creates a good bit of overhead)
        const child_port = e.data.port

        child_port.addEventListener("message", (event) => {
          port.postMessage(event.data);
        });
        port.addEventListener("message", (event) => {
          child_port.postMessage(event.data);
        });

        child_port.start();
        port.start();
      }

      // transformation mirrors
      const buffer = e.data.memory.buffer;
      const pointers = e.data.transformation_pointers;

      const position_mirror_routine = async () => { // manage position mirror
        while (1) {
          await Atomics.waitAsync(pointers, 0, -1).value;
          if (pointers[0] === -1) entity.mirrors.position = null;
          else {
            let position = new Float64Array(buffer, pointers[0], 3);
            if (entity.geometry) {
              position[0] = entity.geometry.position.x;
              position[1] = entity.geometry.position.y;
              position[2] = entity.geometry.position.z;
            }
            entity.mirrors.position = position;
          }
          pointers[0] = -1;
          Atomics.notify(pointers, 0);
        }
      };
      const rotation_mirror_routine = async () => { // manage rotation mirror
        while (1) {
          await Atomics.waitAsync(pointers, 1, -1).value;
          if (pointers[1] === -1) entity.mirrors.rotation = null;
          else {
            let rotation = new Float64Array(buffer, pointers[1], 3);
            if (entity.geometry) {
              rotation[0] = entity.geometry.rotation.x;
              rotation[1] = entity.geometry.rotation.y;
              rotation[2] = entity.geometry.rotation.z;
            }
            entity.mirrors.rotation = rotation;
          }
          pointers[1] = -1;
          Atomics.notify(pointers, 1);
        }
      };
      const scale_mirror_routine = async () => { // manage scale mirror
        while (1) {
          await Atomics.waitAsync(pointers, 2, -1).value;
          if (pointers[2] === -1) entity.mirrors.scale = null;
          else {
            let scale = new Float64Array(buffer, pointers[2], 3);
            if (entity.geometry) {
              scale[0] = entity.geometry.scale.x;
              scale[1] = entity.geometry.scale.y;
              scale[2] = entity.geometry.scale.z;
            }
            entity.mirrors.scale = scale;
          }
          pointers[2] = -1;
          Atomics.notify(pointers, 2);
        }
      };

      position_mirror_routine();
      rotation_mirror_routine();
      scale_mirror_routine();

      // camera transformation mirrors
      const camera_pointers = e.data.camera_transformation_pointers;
      const camera_position_mirror_routine = async () => { // manage position mirror
        while (1) {
          await Atomics.waitAsync(camera_pointers, 0, -1).value;
          if (camera_pointers[0] === -1) entity.mirrors.camera_position = null;
          else {
            let position = new Float64Array(buffer, camera_pointers[0], 3);
            position[0] = camera.position.x;
            position[1] = camera.position.y;
            position[2] = camera.position.z;
            entity.mirrors.camera_position = position;
          }
          camera_pointers[0] = -1;
          Atomics.notify(camera_pointers, 0);
        }
      };
      const camera_rotation_mirror_routine = async () => { // manage rotation mirror
        while (1) {
          await Atomics.waitAsync(camera_pointers, 1, -1).value;
          if (camera_pointers[1] === -1) entity.mirrors.camera_rotation = null;
          else {
            let rotation = new Float64Array(buffer, camera_pointers[1], 3);
            rotation[0] = camera.rotation.x;
            rotation[1] = camera.rotation.y;
            rotation[2] = camera.rotation.z;
            entity.mirrors.camera_rotation = rotation;
          }
          camera_pointers[1] = -1;
          Atomics.notify(camera_pointers, 1);
        }
      };

      camera_position_mirror_routine();
      camera_rotation_mirror_routine();

      worker_unready = false;
    }
  };
  entity.worker.addEventListener("message", ready_listener);
  while (worker_unready) {
    entity.worker.postMessage({
      "etype": "init",
      "module": module,
      "signal_clock": signal_clock,
      "delta_clock": delta_clock,
      "parent_id": parent,
      "id": e_id
    });
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  entity.worker.removeEventListener("message", ready_listener);

  return e_id;
}

entities.set(0, { // world object
  worker: null,
  geometry: null,
  mirrors: {},
  parent: 0,
  children: []
});

init_entity(0, null, "build/entity.wasm", (new MessageChannel()).port1);

function animate(now) {
  delta_clock[1] = now;
  Atomics.notify(signal_clock, 0);
  for (const [_, entity] of entities) {
    // READ BEFORE WRITE
    if (entity.mirrors.camera_position) {
      entity.mirrors.camera_position[0] = camera.position.x;
      entity.mirrors.camera_position[1] = camera.position.y;
      entity.mirrors.camera_position[2] = camera.position.z;
    }
    if (entity.mirrors.camera_rotation) {
      entity.mirrors.camera_rotation[0] = camera.rotation.x;
      entity.mirrors.camera_rotation[1] = camera.rotation.y;
      entity.mirrors.camera_rotation[2] = camera.rotation.z;
    }
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