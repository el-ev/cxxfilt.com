use wasm_bindgen::prelude::*;
use std::ffi::CStr;

extern "C" {
    fn c_itanium_demangle(mangled_name: *const i8, length: usize) -> *mut i8;
    fn c_free_demangled(str: *mut i8);
}

#[wasm_bindgen]
pub fn batch_demangle(symbols: Vec<String>) -> Vec<String> {
    symbols
        .into_iter()
        .map(|s| demangle(&s).unwrap_or(s))
        .collect()
}

#[wasm_bindgen]
pub fn demangle(symbol: &str) -> Option<String> {
    // The symbol should start with "_" in Itanium or Rust v0 style, or start
    // with "?" in MSVC style. Otherwise we just return None.
    if !symbol.starts_with('_') && !symbol.starts_with('?') {
        return None;
    }
    // if the symbol starts with "?", it is in MSVC style
    if symbol.starts_with('?') {
        return demangle_msvc(symbol);
    }

    // if the symbol starts with 1-4 underscores and 'Z', it is in Itanium style or Rust legacy style
    if (1..=4).contains(&symbol.chars().take_while(|&c| c == '_').count())
        && symbol.chars().find(|&c| c != '_') == Some('Z')
    {
        return demangle_itanium(symbol).or(demangle_rust(symbol));
    }

    // if the symbol start with "_R" or "__R" we interpret it as a v0-style Rust symbol
    if symbol.starts_with("_R") || symbol.starts_with("__R") {
        return demangle_rust(symbol);
    }
    None
}

fn demangle_itanium(symbol: &str) -> Option<String> {
    unsafe {
        let ptr = c_itanium_demangle(symbol.as_ptr() as *const i8, symbol.len());
        if ptr.is_null() {
            return None;
        }
        let c_str = CStr::from_ptr(ptr);
        let s = c_str.to_string_lossy().into_owned();
        c_free_demangled(ptr);
        Some(s)
    }
}

fn demangle_rust(symbol: &str) -> Option<String> {
    rustc_demangle::try_demangle(symbol)
        .ok()
        .map(|d| d.to_string())
}

fn demangle_msvc(symbol: &str) -> Option<String> {
    msvc_demangler::demangle(symbol, msvc_demangler::DemangleFlags::llvm()).ok()
}
