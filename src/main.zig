extern "env" fn get_parent_id() i32;
extern "stdlib" fn load_geometry_from_url([*]const u8, usize) void;
extern "stdlib" fn print_obj(f64) void;
extern "stdlib" fn print([*]const u8, usize) void;
extern "stdlib" fn get_child_id(i32) i32;
extern "stdlib" fn spawn_entity_from_url([*]const u8, usize) i32;
extern "stdlib" fn next_frame() f64;
extern "stdlib" fn current_frame() f64;
extern "geometry" fn set_position_mirror([*]f64) void;
extern "geometry" fn set_rotation_mirror([*]f64) void;
extern "io" fn write_to_child(i32, [*]const u8, usize) void;
extern "io" fn read_from_parent([*]const u8, usize) void;
extern "io" fn wait_for_message_parent() void;
extern "camera" fn set_camera_position_mirror([*]f64) void;
extern "camera" fn set_camera_rotation_mirror([*]f64) void;
extern "vr" fn wait_for_squeeze() i32;

const std = @import("std");
const alloc = std.heap.wasm_allocator;

const CAMERA_HEIGHT: f64 = 2.0; // 2 meters
const SPEED: f64 = 0.1; // 0.1 m/s

fn new_entity() i32 {
    const url = "build/entity.wasm";
    return spawn_entity_from_url(url.ptr, url.len);
}

fn generate_row(x: f64) void {
    const time = current_frame();

    // spawn floor tile
    const tile_entity = new_entity();
    var mode: u8 = 0;
    const x_data: [8]u8 = @bitCast(x);
    const time_data: [8]u8 = @bitCast(time);
    var input_data: [17]u8 = undefined;
    input_data[0] = mode;
    input_data[1] = x_data[0];
    input_data[2] = x_data[1];
    input_data[3] = x_data[2];
    input_data[4] = x_data[3];
    input_data[5] = x_data[4];
    input_data[6] = x_data[5];
    input_data[7] = x_data[6];
    input_data[8] = x_data[7];
    input_data[9] = time_data[0];
    input_data[10] = time_data[1];
    input_data[11] = time_data[2];
    input_data[12] = time_data[3];
    input_data[13] = time_data[4];
    input_data[14] = time_data[5];
    input_data[15] = time_data[6];
    input_data[16] = time_data[7];

    write_to_child(tile_entity, &input_data, 16);
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

    set_position_mirror(position.ptr);
    set_rotation_mirror(rotation.ptr);
    set_camera_position_mirror(camera_position.ptr);
    set_camera_rotation_mirror(camera_rotation.ptr);

    if (get_parent_id() == 0) {
        var x: f64 = 0.0;
        var old_timestamp = current_frame();
        while (true) {
            const new_timestamp = next_frame();
            var dt = (new_timestamp - old_timestamp) / 1000;
            if (dt * SPEED >= 1.5) {
                x += dt * SPEED;
                generate_row(x);
                old_timestamp = new_timestamp;
            }
        }
    } else {
        var data = alloc.alloc(u8, 17) catch return -1;
        wait_for_message_parent();
        read_from_parent(data.ptr, 17);
        const mode = data[0];
        const x_data = [8]u8 {
            data[1],
            data[2],
            data[3],
            data[4],
            data[5],
            data[6],
            data[7],
            data[8],
        };
        const x: f64 = @bitCast(x_data);
        const time_data = [8]u8 {
            data[9],
            data[10],
            data[11],
            data[12],
            data[13],
            data[14],
            data[15],
            data[16],
        };
        const time: f64 = @bitCast(time_data);

        if (mode == 0) { // floor tile
            position[1] = 0;
            position[2] = -CAMERA_HEIGHT;

            const url = "floor-tile.glb";
            load_geometry_from_url(url.ptr, url.len);

            position[0] = x + (current_frame() - time) / 1000 * SPEED;
            var old_timestamp = current_frame();
            while (true) {
                const new_timestamp = next_frame();
                const dt = (new_timestamp - old_timestamp) / 1000;

                position[0] += SPEED * dt;

                old_timestamp = new_timestamp;
            }
        }
    }
    
    return 0;
}