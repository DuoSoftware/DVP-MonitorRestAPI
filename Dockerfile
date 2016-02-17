#FROM ubuntu
#RUN apt-get update
#RUN apt-get upgrade -y
#RUN apt-get install -y git nodejs npm
#RUN git clone git://github.com/DuoSoftware/DVP-MonitorRestAPI.git /usr/local/src/monitorrestapi
#RUN cd /usr/local/src/monitorrestapi; npm install
#CMD ["nodejs", "/usr/local/src/monitorrestapi/app.js"]

#EXPOSE 8823

FROM node:argon
RUN git clone git://github.com/DuoSoftware/DVP-MonitorRestAPI.git /usr/local/src/monitorrestapi
RUN cd /usr/local/src/monitorrestapi;
WORKDIR /usr/local/src/monitorrestapi
RUN npm install
EXPOSE 8823
CMD [ "node", "/usr/local/src/monitorrestapi/app.js" ]
