/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Combobox } from "@headlessui/react";
import { sortBy } from "lodash-es";
import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
import type { TIssueCustomProperty } from "@plane/types";
import { cn } from "@plane/utils";

// Number of options rendered at once — properties can have very large option
// lists (e.g. ~1000 customers), so the dropdown is search-driven instead of
// rendering every option.
const MAX_RENDERED_OPTIONS = 100;

type TCustomPropertyOptionSelectProps = {
  property: TIssueCustomProperty;
  value: string | string[] | null;
  onChange: (value: string | string[] | null) => void;
  multiple: boolean;
  disabled?: boolean;
  buttonClassName?: string;
};

export function CustomPropertyOptionSelect(props: TCustomPropertyOptionSelectProps) {
  const { property, value, onChange, multiple, disabled = false, buttonClassName } = props;
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // i18n
  const { t } = useTranslation();

  const { styles, attributes } = usePopper(referenceElement, popperElement, { placement: "bottom-start" });

  const sortedOptions = useMemo(() => sortBy(property.options, "sort_order"), [property.options]);

  const filteredOptions = useMemo(
    () =>
      query === ""
        ? sortedOptions
        : sortedOptions.filter((option) => option.name.toLowerCase().includes(query.toLowerCase())),
    [sortedOptions, query]
  );
  const visibleOptions = filteredOptions.slice(0, MAX_RENDERED_OPTIONS);
  const hiddenOptionsCount = filteredOptions.length - visibleOptions.length;

  const selectedIds = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value]);
  const selectedLabels = selectedIds
    .map((optionId) => property.options.find((option) => option.id === optionId)?.name)
    .filter((name): name is string => !!name);

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery("");
  };
  const toggleDropdown = () => {
    if (isOpen) closeDropdown();
    else setIsOpen(true);
  };

  useOutsideClickDetector(dropdownRef, closeDropdown);

  const handleChange = (selected: string | string[] | null) => {
    // Selecting the already selected value in single-select mode clears it
    if (!multiple && selected === value) onChange(null);
    else onChange(selected);
    if (!multiple) closeDropdown();
  };

  const comboboxProps: Record<string, unknown> = { value: multiple ? selectedIds : (value ?? null), disabled };
  if (multiple) comboboxProps.multiple = true;

  return (
    <Combobox
      as="div"
      ref={dropdownRef}
      className="relative h-full w-full flex-shrink-0 text-left"
      onChange={handleChange}
      {...comboboxProps}
    >
      <Combobox.Button as={React.Fragment}>
        <button
          ref={setReferenceElement}
          type="button"
          className={cn(
            "flex h-full w-full items-center justify-between gap-1 rounded-sm px-2 py-0.5 text-body-xs-regular",
            {
              "cursor-not-allowed": disabled,
              "cursor-pointer hover:bg-layer-transparent-hover": !disabled,
            },
            buttonClassName
          )}
          onClick={toggleDropdown}
        >
          <span className={cn("truncate", { "text-placeholder": selectedLabels.length === 0 })}>
            {selectedLabels.length > 0 ? selectedLabels.join(", ") : t("work_item_custom_properties.select_option")}
          </span>
          {!disabled && <ChevronDownIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
        </button>
      </Combobox.Button>
      {isOpen &&
        createPortal(
          <Combobox.Options data-prevent-outside-click static>
            <div
              className="z-30 my-1 w-60 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 py-2.5 text-11 whitespace-nowrap focus:outline-none"
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
            >
              <div className="mx-2 flex items-center gap-1.5 rounded-sm border border-subtle px-2">
                <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
                <Combobox.Input
                  className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("common.search.label")}
                />
              </div>
              <div className="vertical-scrollbar mt-2 scrollbar-xs max-h-48 space-y-1 overflow-y-scroll px-2">
                {visibleOptions.length > 0 ? (
                  visibleOptions.map((option) => (
                    <Combobox.Option
                      key={option.id}
                      value={option.id}
                      className={({ active }) =>
                        cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                          { "bg-layer-transparent-hover": active }
                        )
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className="flex-grow truncate">{option.name}</span>
                          {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                        </>
                      )}
                    </Combobox.Option>
                  ))
                ) : (
                  <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
                )}
                {hiddenOptionsCount > 0 && (
                  <p className="px-1.5 py-1 text-placeholder italic">
                    {t("work_item_custom_properties.more_options", { count: hiddenOptionsCount })}
                  </p>
                )}
              </div>
            </div>
          </Combobox.Options>,
          document.body
        )}
    </Combobox>
  );
}
