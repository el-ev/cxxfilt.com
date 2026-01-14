//===--- Demangle.h ---------------------------------------------*- C++ -*-===//
//
// Part of the LLVM Project, under the Apache License v2.0 with LLVM Exceptions.
// See https://llvm.org/LICENSE.txt for license information.
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
//===----------------------------------------------------------------------===//

#ifndef LLVM_DEMANGLE_DEMANGLE_H
#define LLVM_DEMANGLE_DEMANGLE_H

#include <cstddef>
#include <optional>
#include <string>

namespace llvm {

char *itaniumDemangle(std::string_view mangled_name);

} // namespace llvm

#endif
