import { OBJECT, TOTAL_OVERHEAD } from "rt/common";

// @ts-ignore decorator
@external("stdlib", "log")
declare function print(str: usize, len: usize): void;
// @ts-ignore decorator
@external("stdlib", "spawn_routine")
declare function spawn_routine(str: usize, len: usize, p: usize): void;
// @ts-ignore decorator
@external("env", "text_encoding")
declare var encoding: i32;
// @ts-ignore decorator
@external("encodings", "UTF_16LE")
declare const utf16: i32;

// @ts-ignore decorator
@start
export function _start(): void {
  encoding = utf16;
}

function strlen(str: usize): usize {
  return changetype<OBJECT>(str - TOTAL_OVERHEAD).rtSize;
}

export function main(): void {
  const msg = changetype<usize>("Hello, World!");
  const thread_name = changetype<usize>("side_main");
  print(msg, strlen(msg));
  spawn_routine(thread_name, strlen(thread_name), 0);
}

export function side_main(): void {
  const msg = changetype<usize>("Thread 2!");
  print(msg, strlen(msg));
}