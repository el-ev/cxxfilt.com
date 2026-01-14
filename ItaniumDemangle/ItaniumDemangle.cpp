//===------------------------- ItaniumDemangle.cpp ------------------------===//
//
// Part of the LLVM Project, under the Apache License v2.0 with LLVM Exceptions.
// See https://llvm.org/LICENSE.txt for license information.
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
//
//===----------------------------------------------------------------------===//

// FIXME: (possibly) incomplete list of features that clang mangles that this
// file does not yet support:
//   - C++ modules TS

#include "ItaniumDemangle.h"
#include "Demangle.h"

#include <cctype>
#include <cstdlib>
#include <cstring>
#include <utility>

using namespace llvm;
using namespace llvm::itanium_demangle;

// <discriminator> := _ <non-negative number>      # when number < 10
//                 := __ <non-negative number> _   # when number >= 10
//  extension      := decimal-digit+               # at the end of string
const char *itanium_demangle::parse_discriminator(const char *first,
                                                  const char *last) {
  // parse but ignore discriminator
  if (first != last) {
    if (*first == '_') {
      const char *t1 = first + 1;
      if (t1 != last) {
        if (std::isdigit(*t1))
          first = t1 + 1;
        else if (*t1 == '_') {
          for (++t1; t1 != last && std::isdigit(*t1); ++t1)
            ;
          if (t1 != last && *t1 == '_')
            first = t1 + 1;
        }
      }
    } else if (std::isdigit(*first)) {
      const char *t1 = first + 1;
      for (; t1 != last && std::isdigit(*t1); ++t1)
        ;
      if (t1 == last)
        first = last;
    }
  }
  return first;
}

namespace {
class BumpPointerAllocator {
  struct BlockMeta {
    BlockMeta *Next;
    size_t Current;
  };

  static constexpr size_t AllocSize = 4096;
  static constexpr size_t UsableAllocSize = AllocSize - sizeof(BlockMeta);

  alignas(long double) char InitialBuffer[AllocSize];
  BlockMeta *BlockList = nullptr;

  void grow() {
    char *NewMeta = static_cast<char *>(std::malloc(AllocSize));
    if (NewMeta == nullptr)
      std::terminate();
    BlockList = new (NewMeta) BlockMeta{BlockList, 0};
  }

  void *allocateMassive(size_t NBytes) {
    NBytes += sizeof(BlockMeta);
    BlockMeta *NewMeta = reinterpret_cast<BlockMeta *>(std::malloc(NBytes));
    if (NewMeta == nullptr)
      std::terminate();
    BlockList->Next = new (NewMeta) BlockMeta{BlockList->Next, 0};
    return static_cast<void *>(NewMeta + 1);
  }

public:
  BumpPointerAllocator()
      : BlockList(new (InitialBuffer) BlockMeta{nullptr, 0}) {}

  void *allocate(size_t N) {
    N = (N + 15u) & ~15u;
    if (N + BlockList->Current >= UsableAllocSize) {
      if (N > UsableAllocSize)
        return allocateMassive(N);
      grow();
    }
    BlockList->Current += N;
    return static_cast<void *>(reinterpret_cast<char *>(BlockList + 1) +
                               BlockList->Current - N);
  }

  void reset() {
    while (BlockList) {
      BlockMeta *Tmp = BlockList;
      BlockList = BlockList->Next;
      if (reinterpret_cast<char *>(Tmp) != InitialBuffer)
        std::free(Tmp);
    }
    BlockList = new (InitialBuffer) BlockMeta{nullptr, 0};
  }

  ~BumpPointerAllocator() { reset(); }
};

class DefaultAllocator {
  BumpPointerAllocator Alloc;

public:
  void reset() { Alloc.reset(); }

  template <typename T, typename... Args> T *makeNode(Args &&...args) {
    return new (Alloc.allocate(sizeof(T))) T(std::forward<Args>(args)...);
  }

  void *allocateNodeArray(size_t sz) {
    return Alloc.allocate(sizeof(Node *) * sz);
  }
};
} // unnamed namespace

//===----------------------------------------------------------------------===//
// Code beyond this point should not be synchronized with libc++abi.
//===----------------------------------------------------------------------===//

using Demangler = itanium_demangle::ManglingParser<DefaultAllocator>;

char *llvm::itaniumDemangle(std::string_view MangledName) {
  if (MangledName.empty())
    return nullptr;

  Demangler Parser(MangledName.data(),
                   MangledName.data() + MangledName.length());
  Node *AST = Parser.parse(true);
  if (!AST)
    return nullptr;

  OutputBuffer OB;
  AST->print(OB);
  OB += '\0';
  return OB.getBuffer();
}
