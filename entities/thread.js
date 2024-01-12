const jobs = {
  "main": 0,
  "side": 1,
  "event": 2
};

let ready = false;
const thread_data = {
  module: null,
  instance: null,
  memory: null
};

// this function will one day be replaced with a simple TextDecoder.decode() call, but that still doesn't support SharedArrayBuffers
function decodeString(pointer, length) {
  const tempBuffer = new ArrayBuffer(length);
  const tempView = new Uint8Array(tempBuffer);

  const sharedView = new Uint8Array(thread_data.memory.buffer, pointer, length);
  tempView.set(sharedView);

  return (new TextDecoder()).decode(tempBuffer);
}

/* INTERNAL ABI */
const NUM_CONST = x => new WebAssembly.Global({ value: "i32" }, x);
const import_object = {
  env: {
    memory: 0, // shared memory
    job: 0, // the set task of the thread
    thread_input: NUM_CONST(0) // a pointer to whatever stuff the program wanted to pass to the new thread
  },
  stdlib: {
    log(pointer, length) {
      console.log(decodeString(pointer, length));
    },
    // spawns a new thread using the exported function of name `name` (string length determined by `length`), passing p as a pointer to whatever stuff the program wants to pass to the new thread
    spawn_routine(name_pointer, length, p) {
      if (!ready) throw WebAssembly.RuntimeError("Threads cannot be spawned during initialization.");
      const decoded_name = decodeString(name_pointer, length);
      postMessage({
        "etype": "routine",
        "name": decoded_name,
        "p": p
      });
    }
  },
  constants: {
    JOB_INIT: NUM_CONST(0), // first thread, initializes entity and does stuff
    JOB_SIDE: NUM_CONST(1), // other normal threads
    JOB_EVENT_HANDLER: NUM_CONST(2), // dedicated event listeners
    EVENT_RECEIVE_MESSAGE: NUM_CONST(0),
  },
}

// get code from main script
var init_resolver;
let init_promise = new Promise((resolve) => {init_resolver = resolve}); // now, init_resolver is effectively a magic [resolve init_promise] button

var init_data;
let init_listener = async (e) => {
  init_data = e.data;
  init_resolver();
}

addEventListener("message", init_listener);
await init_promise;
removeEventListener("message", init_listener);

import_object.env.memory = init_data.memory;
import_object.env.job = NUM_CONST(jobs[init_data.job]);
if (init_data.job === "side") import_object.env.thread_input = NUM_CONST(init_data.p);

thread_data.memory = init_data.memory;
thread_data.module = init_data.module;
thread_data.instance = await WebAssembly.instantiate(init_data.module, import_object);

ready = true;

const exports = thread_data.instance.exports;

if (init_data.job === "main" || init_data.job === "side") exports[init_data.func]();

postMessage({"etype": "ready"});