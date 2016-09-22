FROM node:4-onbuild
EXPOSE 9000

RUN npm install -g grunt-cli@0.1.13 ; \
npm install -g bower@1.3.12 ; \
npm install -g bower-art-resolver ;

RUN echo '{ "allow_root": true }' > /root/.bowerrc
RUN npm install ; npm install -g bower ; bower install

RUN apt-get update; apt-get -y install ruby-full rubygems
RUN gem install bundler -v 1.5.3 ; bundle install

