# cardapio-certo

## Análise de Código com SonarQube

Este projeto está configurado para análise automática de qualidade de código via SonarQube, executada por GitHub Actions a cada `push` nas branches `main` ou `master`.

Antes de executar o workflow, é necessário cadastrar os seguintes **secrets** no repositório do GitHub (Settings → Secrets and variables → Actions):

- `SONAR_TOKEN` — token de autenticação gerado no SonarQube.
- `SONAR_HOST_URL` — URL do servidor SonarQube self-hosted.

Os arquivos envolvidos são:

- `sonar-project.properties` — configuração do projeto Sonar (raiz).
- `.github/workflows/sonarqube.yml` — workflow do GitHub Actions.

> Nenhum token, senha ou URL sensível deve ser commitado no repositório. Use sempre os secrets do GitHub.
