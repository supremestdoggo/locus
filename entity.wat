(module
    (import "stdlib" "log" (func $log (param i32 i32)))
    (import "stdlib" "spawn_routine" (func $thread (param i32 i32 i32)))
    (import "env" "memory" (memory 1 1 shared))

    (data (i32.const 0) "Hello World!")
    (data (i32.const 100) "side_main")
    (data (i32.const 200) "Thread 2!")

    (func $strlen (param $str i32) (result i32)
        (local $i i32)
        (local.set $i (local.get $str))
        (loop $lp
            ;; ch = *i
            local.get $i
            i32.load8_u
            ;; if (ch != 0)
            i32.const 0
            i32.ne

            (if
                (then
                    ;; i++
                    local.get $i
                    i32.const 1
                    i32.add
                    local.set $i

                    br $lp
                )
            )
        )
        local.get $i
        local.get $str
        i32.sub
    )

    (func (export "main")
        i32.const 0
        (call $strlen (i32.const 0))
        call $log
        i32.const 100
        (call $strlen (i32.const 100))
        i32.const 0
        call $thread)
    (func (export "side_main")
        i32.const 200
        (call $strlen (i32.const 200))
        call $log
    )
)