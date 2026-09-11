# Copia para vm_config_secret.py e preenche (vm_config_secret.py está no .gitignore).
#
#   cp vm_config_secret.example.py vm_config_secret.py
#
# NUNCA preencha valores reais neste arquivo .example — ele é versionado. Preencha
# só em vm_config_secret.py (gitignored, nunca commitado).
#
# Deploy default: VM `git pull` from GitHub (public):
#   https://github.com/GustavoEmpresarial/BlockMiner.git @ main
# Override with env BLOCKMINER_GIT_URL / BLOCKMINER_GIT_REF or:
#   ./deploy.sh --ref main
#   ./deploy.sh --git-url https://github.com/GustavoEmpresarial/BlockMiner.git

IP = "203.0.113.10"
LOGIN = "root"
ROOT_PASSWORD = "sua_senha_aqui"
