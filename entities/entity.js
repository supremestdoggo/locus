const memory = new WebAssembly.Memory({
  initial: 1,
  maximum: 1,
  shared: true,
});

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
  init_resolver();
}

addEventListener("message", init_listener);
await init_promise;
removeEventListener("message", init_listener);

await spawn_thread(module);

postMessage({"etype": "ready"});