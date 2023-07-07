# pre-process package json files for build caching
FROM ath88/jq as pre-process-json
COPY package.json full-package.json
COPY package-lock.json full-package-lock.json
RUN jq 'del(.version)' full-package.json > package.json
RUN jq 'del(.version) | del(.packages."".version)' full-package-lock.json > package-lock.json


FROM node:18.16.1-alpine
WORKDIR /usr/src/app

COPY --from=pre-process-json package*.json ./
RUN npm ci --no-audit --omit=dev --silent; rm -rf ~/.npm;
COPY --chown=node:node . .

USER node
ENV NODE_ENV=production

CMD [ "bin/start" ]
