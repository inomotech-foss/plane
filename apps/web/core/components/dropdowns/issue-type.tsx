/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useDropdown } from "@/hooks/use-dropdown";
import { usePlatformOS } from "@/hooks/use-platform-os";
// constants
import { BUTTON_VARIANTS_WITHOUT_TEXT } from "./constants";
// types
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  projectId: string | null | undefined;
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onChange: (val: string) => void;
  onClose?: () => void;
  value: string | null | undefined;
  renderByDefault?: boolean;
};

export const IssueTypeDropdown = observer(function IssueTypeDropdown(props: Props) {
  const { t } = useTranslation();
  const {
    projectId,
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    onChange,
    onClose,
    placeholder = t("work_item_types.label"),
    placement,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
  } = props;
  // store hooks
  const { getActiveProjectIssueTypes, getIssueTypeById, getProjectDefaultIssueType } = useIssueTypes();
  const { isMobile } = usePlatformOS();
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  // derived values
  const issueTypes = getActiveProjectIssueTypes(projectId) ?? [];
  const selectedType = getIssueTypeById(value) ?? getProjectDefaultIssueType(projectId);
  const hideText = BUTTON_VARIANTS_WITHOUT_TEXT.includes(buttonVariant);

  const filteredOptions =
    query === "" ? issueTypes : issueTypes.filter((type) => type.name.toLowerCase().includes(query.toLowerCase()));

  const dropdownOnChange = (val: string) => {
    onChange(val);
    handleClose();
  };

  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    query,
    setIsOpen,
    setQuery,
  });

  // Nothing to render if the project has no active work item types
  if (issueTypes.length === 0) return null;

  const comboButton = (
    <>
      {button ? (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          {button}
        </button>
      ) : (
        <button
          ref={setReferenceElement}
          type="button"
          className={cn(
            "clickable block h-full max-w-full outline-none",
            {
              "cursor-not-allowed text-secondary": disabled,
              "cursor-pointer": !disabled,
            },
            buttonContainerClassName
          )}
          onClick={handleOnClick}
          disabled={disabled}
          tabIndex={tabIndex}
        >
          <Tooltip
            tooltipHeading={t("work_item_types.label")}
            tooltipContent={selectedType?.name ?? placeholder}
            disabled={!showTooltip}
            isMobile={isMobile}
            renderByDefault={renderByDefault}
          >
            <div
              className={cn(
                "flex h-full items-center gap-1.5 rounded-sm border-[0.5px] border-strong bg-layer-2 px-2 py-0.5",
                { "px-0.5": hideText },
                buttonClassName
              )}
            >
              {!hideIcon && selectedType && <Logo logo={selectedType.logo_props} size={12} />}
              {!hideText && (
                <span
                  className={cn("flex-grow truncate text-body-xs-medium", {
                    "text-secondary": !!selectedType,
                    "text-placeholder": !selectedType,
                  })}
                >
                  {selectedType?.name ?? placeholder}
                </span>
              )}
              {dropdownArrow && (
                <ChevronDownIcon
                  className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)}
                  aria-hidden="true"
                />
              )}
            </div>
          </Tooltip>
        </button>
      )}
    </>
  );

  return (
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      className={cn("h-full", { "bg-layer-1": isOpen }, className)}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                displayValue={(assigned: string) => assigned}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((type) => (
                  <Combobox.Option
                    key={type.id}
                    value={type.id}
                    className={({ active, selected }) =>
                      cn(
                        `flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none ${
                          active ? "bg-layer-transparent-hover" : ""
                        } ${selected ? "text-primary" : "text-secondary"}`
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="flex flex-grow items-center gap-2 truncate">
                          <Logo logo={type.logo_props} size={14} />
                          <span className="flex-grow truncate">{type.name}</span>
                        </span>
                        {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">{t("no_matching_results")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
