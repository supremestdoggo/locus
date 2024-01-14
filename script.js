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
  };

  entities.set(e_id, entity)

  // set up communication
  entity.worker.addEventListener("message", async (e) => {})

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

init_entity(0, null, url="build/entity.release.wasm");