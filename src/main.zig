extern "env"      fn get_parent_id() u32;
extern "io"       fn read_from_parent([*]u8, usize) usize;
extern "io"       fn write_to_child(u32, [*]const u8, usize) void;
extern "io"       fn wait_for_message_parent() void;
extern "stdlib"   fn spawn_entity_from_url([*]const u8, usize) u32;
extern "stdlib"   fn print([*]const u8, usize) void;

const std = @import("std");
const alloc = std.heap.wasm_allocator;

export fn main() i32 {
    if (get_parent_id() == 0) {
        const url = "build/entity.wasm";
        const entity_id = spawn_entity_from_url(url.ptr, url.len);

        const message = "Hello, World!";

        write_to_child(entity_id, message.ptr, message.len);
    } else {
        var data = alloc.alloc(u8, 128) catch return -1;
        wait_for_message_parent();
        const length = read_from_parent(data.ptr, 128);
        print(data.ptr, length);
    }
    return 0;
}