(async () => {const import_object = {
    env: {
        memory: new WebAssembly.Memory({
            initial: 32,
            maximum: 64,
            shared: true
        })
    }
}

const fs = require('fs');
const buf = fs.readFileSync('./build/entity.wasm');
const lib = await WebAssembly.instantiate(new Uint8Array(buf), import_object).then(res => res.instance.exports);

console.log(lib.main());})()