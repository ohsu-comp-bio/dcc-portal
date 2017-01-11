FROM node:6.9.4

#ONBUILD ARG NODE_ENV
#ONBUILD ENV NODE_ENV $NODE_ENV

RUN mkdir -p /usr/src/app/dcc-portal-ui
WORKDIR /usr/src/app

COPY .eslintrc.json /usr/src/app

WORKDIR /usr/src/app/dcc-portal-ui

COPY dcc-portal-ui/ /usr/src/app/dcc-portal-ui

RUN npm install

EXPOSE 80 8000 9000


RUN apt-get update
RUN apt-get install curl
# RUN npm install npm@latest -g
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt-get install -y apt-transport-https ca-certificates
RUN apt-get update && apt-get install yarn

RUN echo '{ "allow_root": true }' > /root/.bowerrc
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node

RUN yarn
RUN npm run bower
CMD npm run sethost; npm run dev
