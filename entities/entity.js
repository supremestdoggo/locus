const generateSharedTypedArray = (array_type, elements) => {
  return new array_type(new SharedArrayBuffer(elements * array_type.BYTES_PER_ELEMENT));
};

const memory = new WebAssembly.Memory({
  initial: 32,
  maximum: 64,
  shared: true,
});

const transform_pointers = generateSharedTypedArray(Int32Array, 3);
transform_pointers.set([-1, -1, -1]);
const camera_transform_pointers = generateSharedTypedArray(Int32Array, 2);
camera_transform_pointers.set([-1, -1]);

var thread_count = 0;


const children = new Map();

// creates a byte stack/stream from a MessagePort
function portReader(p) {
  const reader = {
    read(length) {
      let ret = new Uint8Array(length);
    
      let return_length = 0;
      let remainder_length = 0;
      let i = 0;
      while (i < this.chunks.length && return_length < length) {
        let chunk = this.chunks[i++];
        if (return_length + chunk.byteLength > length) {
          let resized_chunk = new Uint8Array(chunk.buffer, 0, length - return_length);
          ret.set(resized_chunk, return_length);
          
          remainder_length = length - return_length;
          
          return_length = length;
        } else {
          ret.set(chunk, return_length);
          return_length += chunk.byteLength;
        }
      }
      
      this.chunks = this.chunks.slice(i - 1);
      if (remainder_length == 0) this.chunks = [];
      else this.chunks[0] = this.chunks[0].slice(remainder_length);
    
      if (return_length < length) return new Uint8Array(ret.buffer, 0, return_length);
      return ret;
    },
    chunks: [],
    resolvers: [],
    wait_for_data() {
      if (this.chunks.length > 0) return Promise.resolve();
      return new Promise((resolve) => {this.resolvers.push(resolve)});
    }
  };

  p.onmessage = (e) => {
    const chunk = e.data;
    reader.chunks.push(chunk);
    reader.resolvers.forEach((resolve) => {resolve()})
  }

  return reader;
}
var signal_clock, delta_clock, port, in_reader, id, parent_id, entity_death_signal, squeeze_signal;
var parent_io_waiting = [];
var child_io_waiting = new Map();

addEventListener("message", (e) => {
  const data = e.data;
  if (data.etype === "death") {
    children.delete(data.id);
  }
})


async function spawn_thread(module, thread_info=null) {
  thread_count++;
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
    } else if (data.etype === "spawn_entity") { // spawn entity
      let channel = new MessageChannel();

      let id_arr = generateSharedTypedArray(Int32Array, 1);
      id_arr[0] = 0;

      postMessage({
        "etype": "spawn_entity",
        "data": data,
        "port": channel.port2,
        "id_arr": id_arr
      }, [channel.port2]);

      await Atomics.waitAsync(id_arr, 0, 0).value;
      children.set(id_arr[0], {
        "port": channel.port1,
        "reader": portReader(channel.port1)
      });
      child_io_waiting.set(id_arr[0], []);

      data.ret[0] = id_arr[0];
      Atomics.notify(data.ret, 1); // return
    } else if (data.etype === "read_parent") { // read message from parent (equivelant to reading from stdin)
      let read_data = in_reader.read(data.length);
      let view = new Uint8Array(memory.buffer, data.offset, read_data.byteLength);

      view.set(read_data);
      data.ret[0] = read_data.byteLength;

      Atomics.notify(data.ret, 1); // return
    } else if (data.etype === "write_parent") { // send message to parent (equivelant to writing to stdout)
      let view = new Uint8Array(memory.buffer, data.offset, data.length);
      let copy = new Uint8Array(data.length); // create a static bytearray from the chunk of memory specified (a shared typedarray would change when the chunk of memory is changed)
      copy.set(view);

      port.postMessage(copy, [copy]);
      Atomics.notify(data.ret, 1);
    } else if (data.etype === "read_child") { // read data from child (equivelant to read child's stdout)
      if (!children.has(data.id)) data.ret[0] = 1;
      else {
        data.ret[0] = 0;

        let read_data = children.get(data.id).reader.read(data.length);
        let view = new Uint8Array(memory.buffer, data.offset, read_data.byteLength);
        view.set(read_data);

        children.get(data.id).port.postMessage(copy, [copy.buffer]);
      }
      Atomics.notify(data.ret, 1);
    } else if (data.etype === "write_child") { // send message to child (equivelant to writing to child's stdin)
      if (!children.has(data.id)) data.ret[0] = 1;
      else {
        let view = new Uint8Array(memory.buffer, data.offset, data.length);
        let copy = new Uint8Array(data.length); // create a static bytearray from the chunk of memory specified (a shared typedarray would change when the chunk of memory is changed)
        copy.set(view);

        children.get(data.id).port.postMessage(copy, [copy.buffer]);
      }
      Atomics.notify(data.ret, 1);
    } else if (data.etype === "wait_parent") {
      in_reader.wait_for_data().then(() => {
        data.ret[1] = 1;
        Atomics.notify(data.ret, 1);
      });
    } else if (data.etype === "wait_child") {
      if (!children.has(data.id)) {
        data.ret[0] = 1;
        data.ret[1] = 1;
        Atomics.notify(data.ret, 1);
      } else {
        data.ret[0] = 0;
        children.get(data.id).reader.wait_for_data().then(() => {
          data.ret[1] = 1;
          Atomics.notify(data.ret, 1);
        });
      }
    }
  });
  const thread_death_signal = generateSharedTypedArray(Int32Array, 1);
  Atomics.waitAsync(thread_death_signal, 0, 0).value.then(() => {
    thread.terminate();
    thread_count--;
    if (thread_count === 0) Atomics.notify(entity_death_signal, 0); // if no more threads are running, terminate entity
  });

  // initialize thread
  let thread_unready = true;
  const ready_listener = (e) => {
    const get_children_routine = async () => {
      while (true) {
        await Atomics.waitAsync(e.data.child_reader, 1, 0).value;
        if (children.has(e.data.child_reader[0])) e.data.child_reader[0] = children.keys().find((_, index) => {return index == e.data.child_reader[0]});
        else e.data.child_reader[0] = -1;
        e.data.child_reader[1] = 0;
      }
    }
    get_children_routine();
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
    "delta_clock": delta_clock,
    "parent_id": parent_id,
    "id": id,
    "camera_transform_pointers": camera_transform_pointers,
    "death_signal": thread_death_signal,
    "squeeze_signal": squeeze_signal
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
function init_listener(e) {
  module = e.data.module;
  entity_death_signal = e.data.death_signal;
  signal_clock = e.data.signal_clock;
  delta_clock = e.data.delta_clock;
  parent_id = e.data.parent_id;
  id = e.data.id;
  squeeze_signal = e.data.squeeze_signal;

  init_resolver();
}

addEventListener("message", init_listener);
await init_promise;
removeEventListener("message", init_listener);

let channel = new MessageChannel();
port = channel.port1;
in_reader = portReader(port);

await spawn_thread(module);

postMessage({
  "etype": "ready",
  "memory": memory,
  "transformation_pointers": transform_pointers,
  "port": channel.port2,
  "camera_transformation_pointers": camera_transform_pointers
}, [channel.port2]);