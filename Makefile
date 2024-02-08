all: build

.PHONY : build

build:
	zig build
	cp ./zig-out/lib/entity.wasm ./build/entity.wasm
	wasm2wat ./build/entity.wasm -o ./build/entity.wat --enable-all