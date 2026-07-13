{{- define "imagePullSecret" }}
{{- printf "{\"auths\":{\"%s\":{\"username\":\"%s\",\"password\":\"%s\"}}}" .Values.dockerRegistry.host .Values.dockerRegistry.loginid .Values.dockerRegistry.password | b64enc }}
{{- end }}

{{- define "plane.podScheduling" -}}
  {{- with .nodeSelector }}
      nodeSelector: {{ toYaml . | nindent 8 }}
  {{- end }}
  {{- with .tolerations }}
      tolerations: {{ toYaml . | nindent 8 }}
  {{- end }}
  {{- with .affinity }}
      affinity: {{ toYaml . | nindent 8 }}
  {{- end }}
{{- end }}

{{/*
Render a component image reference. Appends `:version` only when the image has
neither a digest (`@sha256:...`) nor an explicit tag, so digest-pinned or
already-tagged images are left untouched (avoids refs like `...@sha256:...:tag`).
Call with a dict:
  {{ include "plane.image" (dict "image" (.Values.api.image | default "...") "version" .Values.planeVersion) }}
*/}}
{{- define "plane.image" -}}
{{- $image := .image -}}
{{- if contains ":" (last (splitList "/" $image)) -}}
{{- $image -}}
{{- else if .version -}}
{{- printf "%s:%s" $image .version -}}
{{- else -}}
{{- $image -}}
{{- end -}}
{{- end -}}

{{/*
Chart name and version, sanitized for use as the `helm.sh/chart` label value.
*/}}
{{- define "plane.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Standard Kubernetes recommended labels shared by every resource the chart renders.
These are additive metadata labels only; they are intentionally kept out of
spec.selector/matchLabels (which stay on the immutable `app.name` label) so that
upgrading an existing release never tries to mutate an immutable selector.
Call with the root context, e.g. {{ include "plane.commonLabels" $ }}
*/}}
{{/*
Render the parentRefs for a Gateway API HTTPRoute from ingress.gatewayAPI.parentRefs.
An HTTPRoute may attach to several Gateways (e.g. an HA pair), so this emits every
listed ref. Call with the root context: {{ include "plane.gatewayParentRefs" $ }}
*/}}
{{- define "plane.gatewayParentRefs" -}}
{{- $refs := .Values.ingress.gatewayAPI.parentRefs -}}
{{- if not $refs -}}
{{- fail "ingress.gatewayAPI.parentRefs must list at least one Gateway when gatewayAPI is enabled" -}}
{{- end -}}
parentRefs:
{{- range $refs }}
  - name: {{ required "ingress.gatewayAPI.parentRefs[].name is required" .name }}
    {{- with .namespace }}
    namespace: {{ . }}
    {{- end }}
    {{- with .sectionName }}
    sectionName: {{ . }}
    {{- end }}
{{- end }}
{{- end -}}

{{/*
Render one provisioned env var from an inline value or a mounted file.
Args (dict): key, value (raw inline value, may be empty), default (fallback
applied to the inline value), files (map of env-var name to file path), secret
(when true, the inline value is emitted elsewhere into a Secret, so only the
file form is rendered here). When the key is present in files, `<key>_FILE` is
emitted; otherwise `<key>` (unless secret). Setting both an inline value and a
file for the same key is rejected.
*/}}
{{- define "plane.provision.var" -}}
{{- $file := get .files .key -}}
{{- if and $file .value -}}
{{- fail (printf "provision.auth.oidc: %s cannot be set both inline and via files" .key) -}}
{{- end -}}
{{- if $file -}}
{{ .key }}_FILE: {{ $file | quote }}
{{- else if not .secret -}}
{{ .key }}: {{ .value | default .default | quote }}
{{- end -}}
{{- end -}}

{{- define "plane.commonLabels" -}}
helm.sh/chart: {{ include "plane.chart" . }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Chart.AppVersion }}
app.kubernetes.io/version: {{ . | quote }}
{{- end }}
{{- end -}}

{{/*
Render a resource's `labels` and `annotations` metadata.
Always emits the standard recommended labels (see plane.commonLabels) and merges
any per-component labels supplied under the component's `labels` value. Per-component
annotations are emitted when present.
Call with a dict carrying the root context and the component values:
  {{ include "plane.labelsAndAnnotations" (dict "context" $ "values" .Values.api) }}
*/}}
{{- define "plane.labelsAndAnnotations" }}
  labels:
    {{- include "plane.commonLabels" .context | nindent 4 }}
    {{- with .values.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  {{- with .values.annotations }}
  annotations: {{ toYaml . | nindent 4 }}
  {{- end }}
{{- end }}