# Kustomize skeleton for BlockMiner on k3s/K8s (Phase 0 / Phase 3).
#
# Apply (after copying secret.example.yaml → secret.yaml and editing credentials):
#   cp secret.example.yaml secret.yaml   # edit; do not commit real secrets
#   # then point kustomization resources at secret.yaml instead of secret.example.yaml
#   kubectl apply -k deploy/k8s
#
# Compose remains the default deploy path. Opt into K8s via:
#   BLOCKMINER_USE_K8S=1 ./deploy.sh
# Fallback after cutover defaults to K8s:
#   SKIP_K8S=1 ./deploy.sh
