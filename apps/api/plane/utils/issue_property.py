# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared validation and serialization helpers for issue properties.

Used by both the public v1 API (``plane.api``) and the internal app API
(``plane.app``) so the two surfaces stay behaviorally identical.
"""

# Python imports
import uuid
from decimal import Decimal, InvalidOperation

# Django imports
from django.utils import timezone as django_timezone
from django.utils.dateparse import parse_date, parse_datetime

# Module imports
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    PropertyTypeChoices,
    WorkspaceMember,
)


OPTION_PROPERTY_TYPES = [
    PropertyTypeChoices.OPTION,
    PropertyTypeChoices.MULTI_OPTION,
]

TRUE_VALUES = {"true", "1", "yes"}
FALSE_VALUES = {"false", "0", "no"}


def parse_number(raw):
    """Parse a raw request value into a Decimal or raise ValueError."""
    if isinstance(raw, bool) or raw is None or isinstance(raw, (list, dict)):
        raise ValueError("Value must be numeric")
    try:
        return Decimal(str(raw))
    except InvalidOperation:
        raise ValueError("Value must be numeric")


def parse_boolean(raw):
    """Parse a raw request value into a bool or raise ValueError."""
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        if raw.lower() in TRUE_VALUES:
            return True
        if raw.lower() in FALSE_VALUES:
            return False
    raise ValueError("Value must be a boolean")


def parse_datetime_value(raw):
    """Parse an ISO date or datetime string into an aware datetime or raise ValueError."""
    if not isinstance(raw, str):
        raise ValueError("Value must be an ISO 8601 date or datetime string")
    value = parse_datetime(raw)
    if value is None:
        date_value = parse_date(raw)
        if date_value is None:
            raise ValueError("Value must be an ISO 8601 date or datetime string")
        value = django_timezone.datetime.combine(date_value, django_timezone.datetime.min.time())
    if django_timezone.is_naive(value):
        value = django_timezone.make_aware(value, django_timezone.timezone.utc)
    return value


def resolve_option(property_obj, raw):
    """Resolve a raw request value to an option of the property.

    Accepts an option id or an option name (names make imports pleasant),
    raises ValueError when the option does not exist on the property.
    """
    if isinstance(raw, (list, dict, bool)) or raw is None:
        raise ValueError("Value must be an option id or option name")
    raw = str(raw)
    try:
        option_id = uuid.UUID(raw)
        option = IssuePropertyOption.objects.filter(property=property_obj, id=option_id).first()
        if option is not None:
            return option
    except ValueError:
        # raw is not a UUID — fall through to lookup by option name
        pass
    option = IssuePropertyOption.objects.filter(property=property_obj, name=raw).first()
    if option is None:
        raise ValueError(f"Unknown option '{raw}' for property '{property_obj.name}'")
    return option


def number_to_json(number):
    """Return a Decimal as an int when integral, else a float."""
    if number is None:
        return None
    if number == number.to_integral_value():
        return int(number)
    return float(number)


def value_to_json(value):
    """Serialize a single IssuePropertyValue row to `(value, display)` JSON scalars.

    The related ``property``, ``value_option`` and ``value_user`` must be
    select_related on the row for this to stay query-free.
    """
    property_type = value.property.property_type
    if property_type in OPTION_PROPERTY_TYPES:
        json_value = str(value.value_option_id) if value.value_option_id else None
        display = value.value_option.name if value.value_option_id else None
    elif property_type == PropertyTypeChoices.NUMBER:
        json_value = number_to_json(value.value_number)
        display = json_value
    elif property_type == PropertyTypeChoices.DATE:
        json_value = value.value_date.isoformat() if value.value_date else None
        display = json_value
    elif property_type == PropertyTypeChoices.BOOLEAN:
        json_value = value.value_boolean
        display = value.value_boolean
    elif property_type == PropertyTypeChoices.USER:
        json_value = str(value.value_user_id) if value.value_user_id else None
        display = value.value_user.display_name if value.value_user_id else None
    else:
        json_value = value.value_text
        display = value.value_text
    return json_value, display


def build_value_maps(queryset):
    """Build `{property_id: value(s)}` and `{property_id: display}` maps for a
    queryset of IssuePropertyValue rows belonging to a single work item."""
    values = {}
    display = {}
    for value in queryset:
        property_id = str(value.property_id)
        json_value, json_display = value_to_json(value)
        if value.property.property_type == PropertyTypeChoices.MULTI_OPTION:
            values.setdefault(property_id, [])
            display.setdefault(property_id, [])
            if value.value_option_id:
                values[property_id].append(json_value)
                display[property_id].append(json_display)
        else:
            values[property_id] = json_value
            display[property_id] = json_display
    return values, display


def build_bulk_value_map(queryset):
    """Build a `{issue_id: {property_id: value(s)}}` map for a queryset of
    IssuePropertyValue rows spanning many work items."""
    result = {}
    for value in queryset:
        issue_values = result.setdefault(str(value.issue_id), {})
        property_id = str(value.property_id)
        json_value, _ = value_to_json(value)
        if value.property.property_type == PropertyTypeChoices.MULTI_OPTION:
            issue_values.setdefault(property_id, [])
            if value.value_option_id:
                issue_values[property_id].append(json_value)
        else:
            issue_values[property_id] = json_value
    return result


def build_value_rows(issue, property_obj, raw):
    """Validate a raw request value against the property type and return
    the IssuePropertyValue rows to insert. Raises ValueError on invalid values."""
    base = {
        "issue": issue,
        "property": property_obj,
        "workspace_id": issue.workspace_id,
        "project_id": issue.project_id,
    }
    # None (or an empty list) clears the property values
    if raw is None or raw == [] or raw == "":
        return []

    property_type = property_obj.property_type
    if property_type == PropertyTypeChoices.MULTI_OPTION:
        raw_values = raw if isinstance(raw, list) else [raw]
        options = []
        for raw_value in raw_values:
            option = resolve_option(property_obj, raw_value)
            if option not in options:
                options.append(option)
        return [IssuePropertyValue(**base, value_option=option) for option in options]

    if isinstance(raw, list):
        raise ValueError("A list of values is only allowed for MULTI_OPTION properties")

    if property_type == PropertyTypeChoices.OPTION:
        return [IssuePropertyValue(**base, value_option=resolve_option(property_obj, raw))]
    if property_type == PropertyTypeChoices.NUMBER:
        return [IssuePropertyValue(**base, value_number=parse_number(raw))]
    if property_type == PropertyTypeChoices.DATE:
        return [IssuePropertyValue(**base, value_date=parse_datetime_value(raw))]
    if property_type == PropertyTypeChoices.BOOLEAN:
        return [IssuePropertyValue(**base, value_boolean=parse_boolean(raw))]
    if property_type == PropertyTypeChoices.USER:
        try:
            user_id = uuid.UUID(str(raw))
        except ValueError:
            raise ValueError("Value must be a user id")
        if not WorkspaceMember.objects.filter(
            workspace_id=issue.workspace_id, member_id=user_id, is_active=True
        ).exists():
            raise ValueError(f"Unknown user '{raw}' in this workspace")
        return [IssuePropertyValue(**base, value_user_id=user_id)]
    # TEXT
    if isinstance(raw, dict):
        raise ValueError("Value must be a string")
    return [IssuePropertyValue(**base, value_text=str(raw))]


def validate_value_payload(issue, slug, project_id, data):
    """Validate a `{property_id: value(s)}` request payload for a work item.

    Returns `(properties, new_rows, error_response_payload)`. When
    `error_response_payload` is not None the payload is invalid and should be
    returned with a 400 status.
    """
    if not isinstance(data, dict) or not data:
        return None, None, {"error": "Expected a non-empty mapping of property id to value"}

    property_ids = []
    for key in data.keys():
        try:
            property_ids.append(str(uuid.UUID(str(key))))
        except ValueError:
            return None, None, {"error": f"Invalid property id '{key}'"}

    properties = {
        str(prop.id): prop
        for prop in IssueProperty.objects.filter(
            workspace__slug=slug, project_id=project_id, id__in=property_ids
        )
    }
    unknown = [key for key in data.keys() if str(uuid.UUID(str(key))) not in properties]
    if unknown:
        return None, None, {"error": f"Unknown property id(s): {', '.join(unknown)}"}

    new_rows = []
    errors = {}
    for key, raw in data.items():
        property_obj = properties[str(uuid.UUID(str(key)))]
        try:
            new_rows.extend(build_value_rows(issue, property_obj, raw))
        except ValueError as e:
            errors[str(key)] = str(e)
    if errors:
        return None, None, {"error": "Invalid property values", "errors": errors}

    return properties, new_rows, None


def build_issue_property_filters(query_params, slug, project_id):
    """Translate `property__<property_id>[__gt|__lt]` query params into ORM filters.

    Returns a tuple `(filters, error)` where `filters` is a list of filter
    kwargs dicts (one per query param, each targeting the `property_values`
    relation) and `error` is an error message or None.
    """
    parsed_params = []
    for key in query_params.keys():
        if not key.startswith("property__"):
            continue
        rest = key[len("property__") :]
        operator = "exact"
        for suffix, op in (("__gt", "gt"), ("__lt", "lt")):
            if rest.endswith(suffix):
                operator = op
                rest = rest[: -len(suffix)]
                break
        try:
            property_id = str(uuid.UUID(rest))
        except ValueError:
            return None, f"Invalid property filter '{key}'"
        parsed_params.append((key, property_id, operator, query_params.get(key)))

    if not parsed_params:
        return [], None

    properties = {
        str(prop.id): prop
        for prop in IssueProperty.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            id__in=[param[1] for param in parsed_params],
        )
    }

    filters = []
    for key, property_id, operator, raw in parsed_params:
        property_obj = properties.get(property_id)
        if property_obj is None:
            return None, f"Unknown property id '{property_id}'"

        filter_kwargs = {
            "property_values__property_id": property_id,
            "property_values__deleted_at__isnull": True,
        }
        try:
            if operator in ("gt", "lt"):
                if property_obj.property_type != PropertyTypeChoices.NUMBER:
                    return None, f"'__{operator}' filters are only supported for NUMBER properties"
                filter_kwargs[f"property_values__value_number__{operator}"] = parse_number(raw)
            elif property_obj.property_type == PropertyTypeChoices.NUMBER:
                filter_kwargs["property_values__value_number"] = parse_number(raw)
            elif property_obj.property_type in OPTION_PROPERTY_TYPES:
                filter_kwargs["property_values__value_option_id"] = resolve_option(property_obj, raw).id
            elif property_obj.property_type == PropertyTypeChoices.BOOLEAN:
                filter_kwargs["property_values__value_boolean"] = parse_boolean(raw)
            elif property_obj.property_type == PropertyTypeChoices.DATE:
                filter_kwargs["property_values__value_date"] = parse_datetime_value(raw)
            elif property_obj.property_type == PropertyTypeChoices.USER:
                filter_kwargs["property_values__value_user_id"] = str(uuid.UUID(str(raw)))
            else:
                filter_kwargs["property_values__value_text"] = raw
        except ValueError:
            return None, (
                f"Invalid value for filter '{key}': expected a value matching the "
                f"property type '{property_obj.property_type}'"
            )
        filters.append(filter_kwargs)
    return filters, None
