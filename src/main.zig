extern "stdlib" fn load_geometry_from_url([*]const u8, usize) void;
extern "stdlib" fn print_obj(f64) void;
extern "stdlib" fn print([*]const u8, usize) void;
extern "stdlib" fn next_frame() f64;
extern "geometry" fn set_position_mirror([*]f64) void;

const std = @import("std");
const alloc = std.heap.wasm_allocator;

export fn main() i32 {
    var position = alloc.alloc(f64, 3) catch return -1;
	defer alloc.free(position);

    const url = "Box.glb";

    load_geometry_from_url(url.ptr, url.len);

    set_position_mirror(position.ptr);
    while (next_frame() > 0) {
        position[0] += 0.01;
    }
    return 0;
}