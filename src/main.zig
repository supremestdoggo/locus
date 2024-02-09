extern "stdlib" fn load_geometry_from_url([*]const u8, usize) void;
extern "stdlib" fn print_obj(f64) void;
extern "stdlib" fn print([*]const u8, usize) void;
extern "stdlib" fn next_frame() f64;
extern "geometry" fn set_rotation_mirror([*]f64) void;

const std = @import("std");
const alloc = std.heap.wasm_allocator;

export fn main() i32 {
    var rotation = alloc.alloc(f64, 3) catch return -1;
	defer alloc.free(rotation);

    const url = "Box.glb";

    load_geometry_from_url(url.ptr, url.len);

    set_rotation_mirror(rotation.ptr);
    var old_timestamp = next_frame();
    while (true) {
        const new_timestamp = next_frame();
        const dt = new_timestamp - old_timestamp;

        print_obj(1000/dt); // print current framerate
        rotation[2] += 0.01;

        old_timestamp = new_timestamp;
    }
    return 0;
}