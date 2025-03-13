FROM ubuntu:focal

# Installing the necessary packages
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get upgrade -y
RUN apt-get install -y nodejs

RUN apt-get install git -y

# Working directory of the container
WORKDIR /home/app

# Move all the files to working directory, /home/app
COPY main.sh main.sh
COPY script.js script.js
COPY package*.json .

RUN npm install

# Give executable permission to files
RUN chmod +x main.sh
RUN chmod +x script.js

# As soon as the container gets executed, run main.sh
ENTRYPOINT [ "/home/app/main.sh" ]