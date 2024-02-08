const generateSharedTypedArray = (array_type, elements) => {
  return new array_type(new SharedArrayBuffer(elements * array_type.BYTES_PER_ELEMENT));
};

const memory = new WebAssembly.Memory({
  initial: 32,
  maximum: 64,
  shared: true,
});

const transform_pointers = generateSharedTypedArray(Int32Array, 3);
transform_pointers[0] = -1;
transform_pointers[1] = -1;
transform_pointers[2] = -1;

var signal_clock, delta_clock;

async function spawn_thread(module, thread_info=null) {
  const thread = new Worker("thread.js", { type: "module" });
  const isMain = (thread_info == null);

  // set up message communication
  thread.addEventListener("message", async (e) => {
    const data = e.data;
    if (data.etype === "routine") { // spawn new routine
      spawn_thread(module, {
        "func_name": data.name,
        "job": "side",
      });
    } else if (data.etype === "geo") { // load geometry
      postMessage(data);
    }
  });

  // initialize thread
  let thread_unready = true;
  const ready_listener = () => {
    thread_unready = false;
  };
  thread.addEventListener("message", ready_listener);

  const thread_init_data = {
    "etype": "init",
    "module": module,
    "memory": memory,
    "job": (isMain) ? "main" : thread_info.job,
    "func": (isMain) ? "main": thread_info.func_name,
    "transform_pointers": transform_pointers,
    "signal_clock": signal_clock,
    "delta_clock": delta_clock
  };

  if (!isMain) {
    if (thread_info.job === "side") thread_init_data.p = thread_info.p;
  }

  while (thread_unready) {
    thread.postMessage(thread_init_data);
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  thread.removeEventListener("message", ready_listener);
}

// get code from main script
var init_resolver;
let init_promise = new Promise((resolve) => {init_resolver = resolve}); // now, init_resolver is effectively a magic [resolve init_promise] button

var module;
let init_listener = (e) => {
  module = e.data.module;
  signal_clock = e.data.signal_clock;
  delta_clock = e.data.delta_clock;
  init_resolver();
}

addEventListener("message", init_listener);
await init_promise;
removeEventListener("message", init_listener);

await spawn_thread(module);

postMessage({
  "etype": "ready",
  "memory": memory,
  "transformation_pointers": transform_pointers,
});