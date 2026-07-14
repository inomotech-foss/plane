/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
// plane imports
import { cn, getPageName } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { BlockItemAction } from "@/components/pages/list/block-item-action";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePage } from "@/hooks/store";

type TPageListBlock = {
  pageId: string;
  storeType: EPageStoreType;
  // tree view props
  depth?: number;
  hasChildPages?: boolean;
  isExpanded?: boolean;
  handleToggleExpanded?: () => void;
};

export const PageListBlock = observer(function PageListBlock(props: TPageListBlock) {
  const { pageId, storeType, depth, hasChildPages = false, isExpanded = false, handleToggleExpanded } = props;
  // refs
  const parentRef = useRef(null);
  // hooks
  const { t } = useTranslation();
  const page = usePage({
    pageId,
    storeType,
  });
  const { isMobile } = usePlatformOS();
  // handle page check
  if (!page) return null;
  // derived values
  const { name, logo_props, getRedirectionLink } = page;
  const isTreeView = depth !== undefined;

  return (
    <ListItem
      prependTitleElement={
        <span className="flex items-center gap-1">
          {isTreeView && (
            <>
              {depth > 0 && <span aria-hidden className="flex-shrink-0" style={{ width: `${depth * 20}px` }} />}
              {hasChildPages ? (
                <button
                  type="button"
                  className="grid size-5 flex-shrink-0 place-items-center rounded-sm text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleExpanded?.();
                  }}
                  aria-expanded={isExpanded}
                  aria-label={t(isExpanded ? "page_list_tree.collapse_button" : "page_list_tree.expand_button")}
                >
                  <ChevronRight
                    className={cn("size-3.5 transition-transform duration-200", {
                      "rotate-90": isExpanded,
                    })}
                  />
                </button>
              ) : (
                <span aria-hidden className="size-5 flex-shrink-0" />
              )}
            </>
          )}
          {logo_props?.in_use ? (
            <Logo logo={logo_props} size={16} type="lucide" />
          ) : (
            <PageIcon className="h-4 w-4 text-tertiary" />
          )}
        </span>
      }
      title={getPageName(name)}
      itemLink={getRedirectionLink()}
      actionableItems={<BlockItemAction page={page} parentRef={parentRef} storeType={storeType} />}
      isMobile={isMobile}
      parentRef={parentRef}
    />
  );
});
