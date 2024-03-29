const jobs = {
  "main": 0,
  "side": 1,
  "event": 2
};

const encodings = [
  "utf8",
  "866",
  "l2",
  "l3",
  "l4",
  "cyrillic",
  "arabic",
  "greek",
  "hebrew",
  "logical",
  "l6",
  "iso885913",
  "iso885914",
  "l9",
  "iso-8859-16",
  "koi",
  "koi8-u",
  "mac",
  "dos-874",
  "cp1250",
  "cp1251",
  "l1",
  "cp1253",
  "l5",
  "cp1255",
  "cp1256",
  "cp1257",
  "cp1258",
  "x-mac-cyrillic",
  "gbk",
  "gb18030",
  "big5",
  "euc-jp",
  "csiso2022jp",
  "sjis",
  "euc-kr",
  "hz-gb-2312",
  "utf-16be",
  "ucs-2",
  "x-user-defined"
];

const generateSharedTypedArray = (array_type, elements) => {
  return new array_type(new SharedArrayBuffer(elements * array_type.BYTES_PER_ELEMENT));
};
const return_arr = generateSharedTypedArray(Int32Array, 2); // used for blocking functions
var death_arr, squeeze_signal; // shared array used as an "i am dead" signal, shared array used to detect vr squeezes
const child_reader = generateSharedTypedArray(Int32Array, 2); // get children

let ready = false; // if the thread is ready or not
const thread_data = {
  module: null,
  instance: null,
  memory: null,
  transformation_pointer_array: null, // a shared array containing the pointers to entity position, rotation, and scaling
  clock: { // shared two-element array similar to return_arr. first element is just a wake-up call every frame, second is delta time
    "signal": null,
    "delta": null
  },
  camera_transformation_pointer_array: null // a shared array containing pointers mirroring camera position and rotation
};

// this function will one day be replaced with a simple TextDecoder.decode() call, but that still doesn't support SharedArrayBuffers
function decodeString(pointer, length, encoding_id) {
  const tempBuffer = new ArrayBuffer(length);
  const tempView = new Uint8Array(tempBuffer);

  const sharedView = new Uint8Array(thread_data.memory.buffer, pointer, length);
  tempView.set(sharedView);

  return (new TextDecoder(encodings[encoding_id])).decode(tempBuffer);
}

/* INTERNAL ABI */
const NUM_CONST = x => new WebAssembly.Global({ value: "i32" }, x);
const import_object = {
  // environment
  env: {
    memory: 0, // shared memory
    job: 0, // the set task of the thread
    thread_input: 0, // a pointer to whatever stuff the program wanted to pass to the new thread
    text_encoding: new WebAssembly.Global({ value: "i32", mutable: true }, 0), // current text encoding (defaults to utf-8)
    id: 0,
    parent_id: 0,
    get_id() {return import_object.env.id;},
    get_parent_id() {return import_object.env.parent_id;},
    get_job() {return import_object.env.job;},
    get_thread_input() {return import_object.env.thread_input;},
    get_text_encoding() {return import_object.env.text_encoding;},
    set_text_encoding(encoding) {import_object.env.text_encoding.value = encoding;}
  },
  stdlib: {
    print(pointer, length) {
      console.log(decodeString(pointer, length, import_object.env.text_encoding.value));
    },
    print_obj: console.log,
    // spawns a new thread using the exported function of name `name` (string length determined by `length`), passing p as a pointer to whatever stuff the program wants to pass to the new thread
    spawn_routine(name_pointer, length, p) {
      if (!ready) throw WebAssembly.RuntimeError("Threads cannot be spawned during initialization.");
      const decoded_name = decodeString(name_pointer, length, import_object.env.text_encoding.value);
      postMessage({
        "etype": "routine",
        "name": decoded_name,
        "p": p
      });
    },
    // loads geometry from url
    load_geometry_from_url(url_pointer, length) {
      const decoded_url = decodeString(url_pointer, length, import_object.env.text_encoding.value);
      return_arr[1] = 0; // "value has been returned" flag set to false
      postMessage({
        "etype": "geo",
        "gtype": "url",
        "url": decoded_url,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0); // wait for host to return a value, and if a value has already been returned, skip wait
      return return_arr[0];
    },
    // wait for next frame
    next_frame() {
      Atomics.wait(thread_data.clock.signal, 0);
      return thread_data.clock.delta[1];
    },
    // spawn new entity from url
    spawn_entity_from_url(url_pointer, length) {
      return_arr[1] = 0;
      postMessage({
        "etype": "spawn_entity",
        "origin": "url",
        "url": decodeString(url_pointer, length, import_object.env.text_encoding.value),
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);

      return return_arr[0];
    },
    get_child_id(index) {
      child_reader[0] = index;
      child_reader[1] = 0;
      Atomics.notify(child_reader, 1);
      Atomics.wait(child_reader, 1, 0);
      return child_reader[0];
    },
    current_frame() {
      return thread_data.clock.delta[1];
    }
  },
  // stuff relating to this thread's task
  task: {
    JOB_INIT: NUM_CONST(0), // first thread, initializes entity and does stuff
    JOB_SIDE: NUM_CONST(1), // other normal threads
  },

  /* TEXT ENCODING IDENTIFIERS */
  // there's a kind of recursive issue with using text identifiers for text encodings, so it's best to use numerical identifiers
  encodings: {
    UTF_8: NUM_CONST(0),
    IBM866: NUM_CONST(1),
    ISO_8859_2: NUM_CONST(2),
    ISO_8859_3: NUM_CONST(3),
    ISO_8859_4: NUM_CONST(4),
    ISO_8859_5: NUM_CONST(5),
    ISO_8859_6: NUM_CONST(6),
    ISO_8859_7: NUM_CONST(7),
    ISO_8859_8: NUM_CONST(8),
    ISO_8859_8_I: NUM_CONST(9),
    ISO_8859_10: NUM_CONST(10),
    ISO_8859_13: NUM_CONST(11),
    ISO_8859_14: NUM_CONST(12),
    ISO_8859_15: NUM_CONST(13),
    ISO_8859_16: NUM_CONST(14),
    KOI8_R: NUM_CONST(15),
    KOI8_U: NUM_CONST(16),
    MACINTOSH: NUM_CONST(17),
    WINDOWS_874: NUM_CONST(18),
    WINDOWS_1250: NUM_CONST(19),
    WINDOWS_1251: NUM_CONST(20),
    WINDOWS_1252: NUM_CONST(21),
    WINDOWS_1253: NUM_CONST(22),
    WINDOWS_1254: NUM_CONST(23),
    WINDOWS_1255: NUM_CONST(24),
    WINDOWS_1256: NUM_CONST(25),
    WINDOWS_1257: NUM_CONST(26),
    WINDOWS_1258: NUM_CONST(27),
    X_MAC_CYRILLIC: NUM_CONST(28),
    GBK: NUM_CONST(29),
    GB18030: NUM_CONST(30),
    BIG5: NUM_CONST(31),
    EUC_JP: NUM_CONST(32),
    ISO_2022_JP: NUM_CONST(33),
    SHIFT_JIS: NUM_CONST(34),
    EUC_KR: NUM_CONST(35),
    REPLACEMENT: NUM_CONST(36),
    UTF_16BE: NUM_CONST(37),
    UTF_16LE: NUM_CONST(38),
    X_USER_DEFINED: NUM_CONST(39)
  },
  geometry: {
    set_position_mirror(pointer) {
      thread_data.transformation_pointer_array[0] = pointer;
      Atomics.notify(thread_data.transformation_pointer_array, 0);
      Atomics.wait(thread_data.transformation_pointer_array, 0, pointer);
    },
    set_rotation_mirror(pointer) {
      thread_data.transformation_pointer_array[1] = pointer;
      Atomics.notify(thread_data.transformation_pointer_array, 1);
      Atomics.wait(thread_data.transformation_pointer_array, 1, pointer);
    },
    set_scale_mirror(pointer) {
      thread_data.transformation_pointer_array[2] = pointer;
      Atomics.notify(thread_data.transformation_pointer_array, 2);
      Atomics.wait(thread_data.transformation_pointer_array, 2, pointer);
    }
  },
  io: {
    read_from_parent(pointer, length) { // read data from parent (returns length of bytes read)
      return_arr[1] = 0;
      postMessage({
        "etype": "read_parent",
        "offset": pointer,
        "length": length,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
      return return_arr[0];
    },
    write_to_parent(pointer, length) { // send data to parent
      return_arr[1] = 0;
      postMessage({
        "etype": "write_parent",
        "offset": pointer,
        "length": length,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
    },
    read_from_child(id, pointer, length) { // read data from child (returns length of bytes read)
      return_arr[1] = 0;
      postMessage({
        "etype": "read_child",
        "id": id,
        "offset": pointer,
        "length": length,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
      return return_arr[0];
    },
    write_to_child(id, pointer, length) {
      return_arr[1] = 0;
      postMessage({
        "etype": "write_child",
        "id": id,
        "offset": pointer,
        "length": length,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
      return return_arr[0];
    },
    wait_for_message_parent() { // wait for data from parent
      return_arr[1] = 0;
      postMessage({
        "etype": "wait_parent",
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
    },
    wait_for_message_child(id) { // wait for data from child
      return_arr[1] = 0;
      postMessage({
        "etype": "wait_child",
        "id": id,
        "ret": return_arr
      });
      Atomics.wait(return_arr, 1, 0);
      return return_arr[0];
    }
  },
  camera: {
    set_camera_position_mirror(pointer) {
      thread_data.camera_transformation_pointer_array[0] = pointer;
      Atomics.notify(thread_data.camera_transformation_pointer_array, 0);
      Atomics.wait(thread_data.camera_transformation_pointer_array, 0, pointer);
    },
    set_camera_rotation_mirror(pointer) {
      thread_data.camera_transformation_pointer_array[1] = pointer;
      Atomics.notify(thread_data.camera_transformation_pointer_array, 1);
      Atomics.wait(thread_data.camera_transformation_pointer_array, 1, pointer);
    }
  },
  vr: {
    wait_for_squeeze() {
      Atomics.wait(squeeze_signal, 1, 0);
      return squeeze_signal[0];
    }
  }
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

death_arr = init_data.death_signal;

import_object.env.memory = init_data.memory;
import_object.env.job = NUM_CONST(jobs[init_data.job]);
import_object.env.parent_id = init_data.parent_id;
import_object.env.id = init_data.id;
if (init_data.job === "side") import_object.env.thread_input = NUM_CONST(init_data.p);

squeeze_signal = init_data.squeeze_signal;
thread_data.memory = init_data.memory;
thread_data.module = init_data.module;
thread_data.transformation_pointer_array = init_data.transform_pointers;
thread_data.clock.signal = init_data.signal_clock;
thread_data.clock.delta = init_data.delta_clock;
thread_data.camera_transformation_pointer_array = init_data.camera_transform_pointers;
thread_data.instance = await WebAssembly.instantiate(init_data.module, import_object);

ready = true;
postMessage({
  "etype": "ready",
  "child_reader": child_reader
});

const exports = thread_data.instance.exports;

if (init_data.job === "main" || init_data.job === "side") exports[init_data.func]();
Atomics.notify(death_arr, 0); // terminate thread