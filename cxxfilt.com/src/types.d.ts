declare module "*.wasm" {
  const content: WebAssembly.Module;
  export default content;
}

declare module '__STATIC_CONTENT_MANIFEST' {
  const content: string;
  export default content;
}
