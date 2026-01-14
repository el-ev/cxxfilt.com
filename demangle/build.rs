fn main() {
    println!("cargo:rerun-if-changed=src/itanium_wrapper.cpp");
    println!("cargo:rerun-if-changed=../ItaniumDemangle/ItaniumDemangle.cpp");

    let wasi_sdk_path = std::env::var("WASI_SDK_PATH").unwrap_or("/opt/wasi-sdk".to_string());
    let sysroot_lib = format!("{}/share/wasi-sysroot/lib/wasm32-wasi", wasi_sdk_path);

    cc::Build::new()
        .cpp(true)
        .std("c++17")
        .opt_level(2)
        .file("../ItaniumDemangle/ItaniumDemangle.cpp")
        .file("src/itanium_wrapper.cpp")
        .target("wasm32-wasi")
        .flag("-fno-exceptions")
        .flag("-fno-rtti")
        .flag("-D_LIBCPP_HAS_NO_THREADS")
        .compile("demangle_cpp");

    println!("cargo:rustc-link-search=native={}", sysroot_lib);
    println!("cargo:rustc-link-lib=static=c++"); // libc++.a
    println!("cargo:rustc-link-lib=static=c++abi"); // libc++abi.a
    println!("cargo:rustc-link-lib=static=c"); // libc.a
}
