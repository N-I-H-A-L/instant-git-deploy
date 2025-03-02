#!/bin/bash

export GIT_REPO_URL="$GIT_REPO_URL"

# Repo will be cloned in this path of the container (means the "output" directory of working directory)
git clone "$GIT_REPO_URL" /home/app/output

exec node script.js