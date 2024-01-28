import { OBJECT, TOTAL_OVERHEAD } from "rt/common";

// @ts-ignore decorator
@external("env", "text_encoding")
declare var encoding: i32;
// @ts-ignore decorator
@external("encodings", "UTF_16LE")
declare const utf16: i32;
// @ts-ignore decorator
@external("stdlib", "load_geometry_from_url")
declare function load_geo(str: usize, len: usize): i32;
// @ts-ignore decorator
@external("stdlib", "log")
declare function print(str: usize, len: usize): i32;


// @ts-ignore decorator
@start
export function _start(): void {
  encoding = utf16;
}

function strlen(str: usize): usize {
  return changetype<OBJECT>(str - TOTAL_OVERHEAD).rtSize;
}

export function main(): void {
  const path = changetype<usize>("Box.glb");
  load_geo(path, strlen(path));
  print(path, strlen(path));
}