#include "../../ItaniumDemangle/Demangle.h"
#include <cstdlib>
#include <cstring>

extern "C" {
    char* c_itanium_demangle(const char* mangled_name, size_t length) {
        std::string_view view(mangled_name, length);
        return llvm::itaniumDemangle(view);
    }

    void c_free_demangled(char* str) {
        std::free(str);
    }
}
