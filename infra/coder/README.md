# senpi Coder template

Mac mini Coder template for `IYEN-AI/senpi`.

- Coder URL: http://100.90.37.68:7080
- Runtime: Docker via Colima profile `coder`
- Workspace image: `codercom/enterprise-base:ubuntu`
- Repo path inside workspace: `/home/coder/senpi`
- Default branch: `main`

Local CLI example:

```bash
export CODER_URL=http://100.90.37.68:7080
export CODER_SESSION_TOKEN=<token>
/usr/local/bin/coder templates push senpi --directory infra/coder
/usr/local/bin/coder create senpi-dev --template senpi --use-parameter-defaults
```
