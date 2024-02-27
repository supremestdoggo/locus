extern "stdlib" fn load_geometry_from_url([*]const u8, usize) void;
extern "stdlib" fn print_obj(f64) void;
extern "stdlib" fn print([*]const u8, usize) void;
extern "geometry" fn set_position_mirror([*]f64) void;
extern "geometry" fn set_rotation_mirror([*]f64) void;
extern "camera" fn set_camera_position_mirror([*]f64) void;
extern "camera" fn set_camera_rotation_mirror([*]f64) void;

const std = @import("std");
const alloc = std.heap.wasm_allocator;

fn unit_vector_from_euler(_: f64, y: f64, z: f64) [3]f64 {
    return [_]f64{@sin(z), -@sin(y)*@cos(z), -@cos(y)*@cos(z)};
}

fn distance_from_origin(x: f64, y: f64, z: f64) f64 {
    return @sqrt(x*x + y*y + z*z);
}

export fn main() i32 {
    var position = alloc.alloc(f64, 3) catch return -1;
    var rotation = alloc.alloc(f64, 3) catch return -1;
    var camera_position = alloc.alloc(f64, 3) catch return -1;
    var camera_rotation = alloc.alloc(f64, 3) catch return -1;
    defer alloc.free(position);
    defer alloc.free(rotation);
    defer alloc.free(camera_position);
    defer alloc.free(camera_rotation);

    const url = "Box.glb";

    load_geometry_from_url(url.ptr, url.len);

    set_position_mirror(position.ptr);
    set_rotation_mirror(rotation.ptr);
    set_camera_position_mirror(camera_position.ptr);
    set_camera_rotation_mirror(camera_rotation.ptr);

    position[0] = camera_position[0] - @sqrt(3.0) / 1.5;
    position[1] = camera_position[1] - @sqrt(3.0) / 1.5;
    position[2] = camera_position[2] - @sqrt(3.0) / 1.5;

    const distance_from_camera = distance_from_origin(position[0] - camera_position[0], position[1] - camera_position[1], position[2] - camera_position[2]);
    print_obj(distance_from_camera);
    const camera_direction = unit_vector_from_euler(camera_rotation[0], camera_rotation[1], camera_rotation[2]);
    print_obj(camera_direction[0]);
    print_obj(camera_direction[1]);
    print_obj(camera_direction[2]);
    var cam_pos_vector: @Vector(3, f64) = .{camera_position[0], camera_position[1], camera_position[2]};
    const camera_dist_vector: @Vector(3, f64) = @splat(distance_from_camera);
    var new_position: @Vector(3, f64) = camera_direction;
    new_position = new_position * camera_dist_vector + cam_pos_vector;

    position[0] = new_position[0];
    position[1] = new_position[1];
    position[2] = new_position[2];

    while (true) {}
    
    return 0;
}