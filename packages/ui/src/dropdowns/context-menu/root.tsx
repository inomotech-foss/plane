/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
// hooks
import { usePlatformOS } from "../../hooks/use-platform-os";
// helpers
import { cn } from "../../utils/classname";
// components
import { ContextMenuItem } from "./item";

export type TContextMenuItem = {
  key: string;
  customContent?: React.ReactNode;
  title?: string;
  description?: string;
  icon?: React.FC<any>;
  action: () => void;
  shouldRender?: boolean;
  closeOnClick?: boolean;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  nestedMenuItems?: TContextMenuItem[];
};

// Portal component for nested menus
interface PortalProps {
  children: React.ReactNode;
  container?: Element | null;
}

export function Portal({ children, container }: PortalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return null;
  }

  const targetContainer = container || document.body;
  return ReactDOM.createPortal(children, targetContainer);
}

// Context for managing nested menus
export const ContextMenuContext = React.createContext<{
  closeAllSubmenus: () => void;
  registerSubmenu: (closeSubmenu: () => void) => () => void;
  portalContainer?: Element | null;
} | null>(null);

type ContextMenuProps = {
  parentRef: React.RefObject<HTMLElement>;
  items: TContextMenuItem[];
  portalContainer?: Element | null;
};

function ContextMenuWithoutPortal(props: ContextMenuProps) {
  const { parentRef, items, portalContainer } = props;
  // states
  const [isOpen, setIsOpen] = useState(false);
  // raw click coordinates; the rendered position is clamped to the viewport
  // in a layout effect once the menu is mounted and measurable
  const [clickPosition, setClickPosition] = useState({
    x: 0,
    y: 0,
  });
  const [position, setPosition] = useState({
    x: 0,
    y: 0,
  });
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  // refs
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const submenuClosersRef = useRef<Set<() => void>>(new Set());
  // derived values
  const renderedItems = items.filter((item) => item.shouldRender !== false);
  const { isMobile } = usePlatformOS();

  const closeAllSubmenus = React.useCallback(() => {
    submenuClosersRef.current.forEach((closeSubmenu) => closeSubmenu());
  }, []);

  const registerSubmenu = React.useCallback((closeSubmenu: () => void) => {
    submenuClosersRef.current.add(closeSubmenu);
    return () => {
      submenuClosersRef.current.delete(closeSubmenu);
    };
  }, []);

  const handleClose = React.useCallback(() => {
    closeAllSubmenus();
    setIsOpen(false);
    setActiveItemIndex(0);
  }, [closeAllSubmenus]);

  // open the context menu at the click position
  useEffect(() => {
    const parentElement = parentRef.current;
    if (!parentElement) return;

    const handleContextMenu = (e: MouseEvent) => {
      if (isMobile) return;

      e.preventDefault();
      e.stopPropagation();

      const nextPosition = { x: e?.pageX || 0, y: e?.pageY || 0 };
      setClickPosition(nextPosition);
      // render at the click position immediately; the layout effect below
      // clamps it to the viewport before paint
      setPosition(nextPosition);
      setIsOpen(true);
    };

    parentElement.addEventListener("contextmenu", handleContextMenu);

    return () => {
      parentElement.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isMobile, parentRef, setIsOpen, setPosition]);

  // The menu is only in the DOM while open, so its size can be measured only
  // after it mounts: clamp the position to the viewport before first paint.
  React.useLayoutEffect(() => {
    const contextMenu = contextMenuRef.current;
    if (!isOpen || !contextMenu) return;

    const contextMenuWidth = contextMenu.clientWidth;
    const contextMenuHeight = contextMenu.clientHeight;

    // if there's not enough space at the bottom/right, show at the top/left
    const top =
      clickPosition.y + contextMenuHeight > window.innerHeight ? clickPosition.y - contextMenuHeight : clickPosition.y;
    const left =
      clickPosition.x + contextMenuWidth > window.innerWidth ? clickPosition.x - contextMenuWidth : clickPosition.x;
    setPosition((prev) => (prev.x === left && prev.y === top ? prev : { x: left, y: top }));
  }, [isOpen, clickPosition]);

  // Escape-to-close: listen on window only while the menu is open, so every
  // closed instance (one per list row) contributes no global listeners
  useEffect(() => {
    if (!isOpen) return;

    const hideContextMenu = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", hideContextMenu);
    return () => {
      window.removeEventListener("keydown", hideContextMenu);
    };
  }, [isOpen, handleClose]);

  // handle keyboard navigation (registered only while open — one closed
  // instance is rendered per list row and must not add global listeners)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveItemIndex((prev) => (prev + 1) % renderedItems.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveItemIndex((prev) => (prev - 1 + renderedItems.length) % renderedItems.length);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = renderedItems[activeItemIndex];
        if (!item.disabled) {
          renderedItems[activeItemIndex].action();
          if (item.closeOnClick !== false) handleClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeItemIndex, isOpen, renderedItems, setIsOpen]);

  // Custom handler for nested menu portal clicks
  React.useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if the click is on a nested menu element
      const isNestedMenuClick = target.closest('[data-context-submenu="true"]');
      const isMainMenuClick = contextMenuRef.current?.contains(target);

      // Also check if the target itself has the data attribute
      const isNestedMenuElement = target.hasAttribute("data-context-submenu");

      // If it's a nested menu click, main menu click, or nested menu element, don't close
      if (isNestedMenuClick || isMainMenuClick || isNestedMenuElement) {
        return;
      }

      // If menu is open and it's an outside click, close it
      if (isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      // Use capture phase to ensure we handle the event before other handlers
      document.addEventListener("mousedown", handleDocumentClick, true);
      return () => {
        document.removeEventListener("mousedown", handleDocumentClick, true);
      };
    }
  }, [isOpen, handleClose]);

  // keep closed menus out of the DOM entirely — a hidden overlay + full item
  // list per row is a significant cost in long lists
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-30 h-screen w-screen cursor-default opacity-0 transition-opacity",
        {
          "pointer-events-auto opacity-100": isOpen,
        }
      )}
    >
      <div
        ref={contextMenuRef}
        className="vertical-scrollbar fixed scrollbar-sm max-h-72 min-w-[12rem] overflow-y-scroll rounded-md border-[0.5px] border-subtle-1 bg-surface-1 px-2 py-2.5"
        style={{
          top: position.y,
          left: position.x,
        }}
        data-context-menu="true"
      >
        <ContextMenuContext.Provider value={{ closeAllSubmenus, registerSubmenu, portalContainer }}>
          {renderedItems.map((item, index) => (
            <ContextMenuItem
              key={item.key}
              handleActiveItem={() => setActiveItemIndex(index)}
              handleClose={handleClose}
              isActive={index === activeItemIndex}
              item={item}
            />
          ))}
        </ContextMenuContext.Provider>
      </div>
    </div>
  );
}

export function ContextMenu(props: ContextMenuProps) {
  let contextMenu = <ContextMenuWithoutPortal {...props} />;
  const portal = document.querySelector("#context-menu-portal");
  if (portal) contextMenu = ReactDOM.createPortal(contextMenu, portal);
  return contextMenu;
}
