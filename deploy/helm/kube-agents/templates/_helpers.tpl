{{/*
Expand the name of the chart.
*/}}
{{- define "kube-agents.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kube-agents.fullname" -}}
{{- default .Chart.Name .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Namespace to use.
*/}}
{{- define "kube-agents.namespace" -}}
{{- .Values.global.namespace | default .Release.Namespace }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "kube-agents.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: kube-agents
{{- end }}

{{/*
NATS URL constructed from service name and port.
*/}}
{{- define "kube-agents.natsUrl" -}}
nats://nats.{{ include "kube-agents.namespace" . }}.svc.cluster.local:{{ .Values.nats.clientPort }}
{{- end }}
