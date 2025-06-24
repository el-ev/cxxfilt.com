/// <reference types="emscripten" />
export interface CxxfiltModule extends EmscriptenModule {
    ccall: typeof ccall;
    callMain(args: string[]): Promise<number>;
}

declare const cxxfiltModule: EmscriptenModuleFactory<CxxfiltModule>;
export default cxxfiltModule;
