#include "clang/AST/CharUnits.h"
#include "llvm/ADT/SmallVector.h"
#include <cstdint>
#include <string>

namespace cxxlayout {

enum class FieldType : uint8_t {
  Simple,
  Record,
  BitField,
  NVPrimaryBase,
  NVBase,
  VPrimaryBase,
  VBase,
  VPtr,
  VFPtr,
  VBPtr,
};

inline constexpr std::string_view fieldTypeToString(FieldType ft) {
  switch (ft) {
  case FieldType::Record:
    return "Record";
  case FieldType::VPtr:
    return "VPtr";
  case FieldType::VFPtr:
    return "VFPtr";
  case FieldType::VBPtr:
    return "VBPtr";
  case FieldType::VPrimaryBase:
    return "VPrimaryBase";
  case FieldType::VBase:
    return "VBase";
  case FieldType::NVPrimaryBase:
    return "NVPrimaryBase";
  case FieldType::NVBase:
    return "NVBase";
  case FieldType::BitField:
    return "BitField";
  case FieldType::Simple:
    return "Simple";
  default:
    return "Unknown";
  }
}

class FieldInfo;
using FieldInfoPtr = std::unique_ptr<FieldInfo>;

class FieldInfo {
public:
  bool isValid = false;
  FieldType fieldType = FieldType::Simple;
  std::string name;
  std::string type;
  uint64_t offset = 0; // in bits
  clang::CharUnits size;
  clang::CharUnits align;
  uint64_t bitWidth = 0; // for bitfields
  llvm::SmallVector<FieldInfoPtr> subFields;
};

} // namespace cxxlayout
