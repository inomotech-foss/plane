/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// editors
export {
  CollaborativeDocumentEditorWithRef,
  DocumentEditorWithRef,
  LiteTextEditorWithRef,
  RichTextEditorWithRef,
} from "@/components/editors";

// constants
export * from "@/constants/common";

// helpers
export * from "@/helpers/common";
export * from "@/helpers/yjs-utils";

export { CORE_EXTENSIONS } from "@/constants/extension";
export { ADDITIONAL_EXTENSIONS } from "@/plane-editor/constants/extensions";

// types
export * from "@/types";

// additional exports
export { TrailingNode } from "./core/extensions/trailing-node";
export {
  COMMENT_MARK_CLASS,
  COMMENT_MARK_DATA_ATTRIBUTE,
  COMMENT_MARK_RESOLVED_ATTRIBUTE,
  EDITOR_COMMENT_RESOLVE_EVENT,
  EDITOR_COMMENT_UNSET_EVENT,
} from "./core/extensions/comment/comment-mark";
export { EDITOR_COMMENT_CREATE_EVENT } from "./core/helpers/editor-commands";
