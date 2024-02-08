const std = @import("std");

pub fn build(b: *std.build.Builder) void {
    const optimize = b.standardOptimizeOption(.{});

    var target = default_target(.wasm32, .freestanding);
    target.cpu.features = std.Target.wasm.featureSet(&.{ .mutable_globals, .bulk_memory, .atomics });
    //target.cpu.features = std.Target.wasm.featureSet(&.{ .mutable_globals });

    var lib = b.addSharedLibrary(.{
        .name = "entity",
        .root_source_file = .{ .path = "./src/main.zig" },
        .target = std.zig.CrossTarget.fromTarget(target),
        .optimize = optimize,
    });

    lib.rdynamic = true;
    lib.initial_memory = 32*65536;
    lib.max_memory = 64*65536;
    lib.import_memory = true;
    lib.shared_memory = true;
    // importing and sharing memory can be done by import_transform.js
    
    b.installArtifact(lib);
}

fn default_target(arch: std.Target.Cpu.Arch, os_tag: std.Target.Os.Tag) std.Target {
    const os = os_tag.defaultVersionRange(arch);
    return std.Target{
        .cpu = std.Target.Cpu.baseline(arch),
        .abi = std.Target.Abi.default(arch, os),
        .os = os,
        .ofmt = std.Target.ObjectFormat.default(os_tag, arch),
    };
}